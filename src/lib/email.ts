/**
 * Repair-status email notifications. Configuration is stored in app settings and
 * sent through the native `send_email` command (SMTP). Sends are queued in the
 * outbox first so a status update is never lost when the internet is down.
 */
import { invoke } from "@tauri-apps/api/core";
import { getSetting } from "@/lib/repos/settings";
import { useBrandStore } from "@/stores/brand";
import {
  enqueueEmail,
  claimEmail,
  markEmailSent,
  markEmailFailed,
  listPendingEmails,
  resetStaleSending,
  pendingEmailCount,
  type OutboxEmail,
} from "@/lib/repos/outbox";

const MAX_ATTEMPTS = 10;

export interface SmtpConfig {
  enabled: boolean;
  host: string;
  port: number;
  user: string;
  pass: string;
  fromName: string;
  fromEmail: string;
  statuses: string[];
}

/** Statuses customers are notified about by default (the meaningful milestones). */
export const DEFAULT_NOTIFY_STATUSES = [
  "Diagnosed",
  "Awaiting Parts",
  "In Repair",
  "Awaiting Pickup",
  "Completed",
  "Unrepairable (BER)",
];

/** Every status a shop can choose to notify on. */
export const NOTIFIABLE_STATUSES = [
  "Intake",
  "Diagnosed",
  "Awaiting Parts",
  "In Repair",
  "QC",
  "Awaiting Pickup",
  "Completed",
  "Unrepairable (BER)",
];

export async function loadSmtpConfig(): Promise<SmtpConfig> {
  const [enabled, host, port, user, pass, fromName, fromEmail, statuses] = await Promise.all([
    getSetting<boolean>("notify.enabled", false),
    getSetting<string>("notify.smtp_host", "smtp.gmail.com"),
    getSetting<number>("notify.smtp_port", 587),
    getSetting<string>("notify.smtp_user", ""),
    getSetting<string>("notify.smtp_pass", ""),
    getSetting<string>("notify.from_name", ""),
    getSetting<string>("notify.from_email", ""),
    getSetting<string[]>("notify.statuses", DEFAULT_NOTIFY_STATUSES),
  ]);
  return { enabled, host, port: port || 587, user, pass, fromName, fromEmail, statuses };
}

export interface ShopBranding {
  name: string;
  phone: string;
  address: string;
  email: string;
}

async function loadShopBranding(): Promise<ShopBranding> {
  const [phone, address, email] = await Promise.all([
    getSetting<string>("shop.phone", ""),
    getSetting<string>("shop.address", ""),
    getSetting<string>("shop.email", ""),
  ]);
  return { name: useBrandStore.getState().name, phone, address, email };
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// --- per-status content + visual styling -------------------------------------

type Tone = "green" | "blue" | "amber" | "slate" | "red";
// Tone colors chosen so white text on them clears WCAG AA (>= 4.5:1) for the pill.
const TONE_COLOR: Record<Tone, string> = {
  green: "#15803D",
  blue: "#1D4ED8",
  amber: "#B45309",
  slate: "#475569",
  red: "#B91C1C",
};
const STATUS_TONE: Record<string, Tone> = {
  Intake: "slate",
  Diagnosed: "blue",
  "Awaiting Parts": "amber",
  "In Repair": "blue",
  QC: "blue",
  "Awaiting Pickup": "green",
  Completed: "green",
  Closed: "green",
  "Unrepairable (BER)": "red",
};
const PROGRESS_LABELS = ["Received", "Diagnosed", "Repair", "Ready", "Done"];
const STATUS_STEP: Record<string, number> = {
  Intake: 0,
  Diagnosed: 1,
  "Awaiting Parts": 1,
  "In Repair": 2,
  QC: 2,
  "Awaiting Pickup": 3,
  Completed: 4,
  Closed: 4,
};

function statusContent(status: string, device: string): { headline: string; message: string } {
  switch (status) {
    case "Intake":
      return {
        headline: "We've received your device",
        message: `Your ${device} is checked in and in line for our technicians. We'll keep you posted at every step.`,
      };
    case "Diagnosed":
      return {
        headline: "Diagnosis complete",
        message: `Our technician has finished diagnosing your ${device} and we know exactly what it needs. We're moving it forward now.`,
      };
    case "Awaiting Parts":
      return {
        headline: "Waiting on a part",
        message: `We've ordered the part your ${device} needs. The moment it arrives we'll get straight back to the repair. Thanks for your patience.`,
      };
    case "In Repair":
      return {
        headline: "Your repair is underway",
        message: `Good news - our technician is actively working on your ${device} right now.`,
      };
    case "QC":
      return {
        headline: "Final testing",
        message: `The repair on your ${device} is done and we're running it through our quality checks to make sure everything is perfect before you pick it up.`,
      };
    case "Awaiting Pickup":
      return {
        headline: "Ready for pickup",
        message: `Your ${device} is repaired, tested, and ready to come home. Swing by whenever is convenient.`,
      };
    case "Completed":
    case "Closed":
      return {
        headline: "All done - thank you",
        message: `Your ${device} repair is complete. It was a pleasure helping you, and we hope it's running like new. We're here if you ever need us again.`,
      };
    case "Unrepairable (BER)":
      return {
        headline: "An update on your device",
        message: `After a thorough look, we weren't able to complete this repair on your ${device}. Please reach out and we'll walk you through the options.`,
      };
    default:
      return { headline: "An update on your repair", message: `Your repair status is now ${status}.` };
  }
}

function progressHtml(current: number, color: string): string {
  const track = "#E4ECFC";
  const dotCells: string[] = [];
  const labelCells: string[] = [];
  PROGRESS_LABELS.forEach((label, i) => {
    const done = i <= current;
    const isCurrent = i === current;
    const size = isCurrent ? 16 : 12;
    dotCells.push(
      `<td width="22" align="center" valign="middle" style="padding:0"><div style="width:${size}px;height:${size}px;border-radius:50%;background:${done ? color : "#ffffff"};border:2px solid ${done ? color : track};margin:0 auto"></div></td>`,
    );
    labelCells.push(
      `<td width="22" align="center" style="font-size:10px;line-height:13px;white-space:nowrap;color:${done ? "#0F172A" : "#94A3B8"};font-weight:${isCurrent ? "700" : "400"};padding-top:7px">${label}</td>`,
    );
    if (i < PROGRESS_LABELS.length - 1) {
      // Connector segment, filled once both ends are reached.
      dotCells.push(
        `<td valign="middle" style="padding:0"><div style="height:2px;background:${i < current ? color : track};font-size:0;line-height:0">&nbsp;</div></td>`,
      );
      labelCells.push(`<td>&nbsp;</td>`);
    }
  });
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0 8px">
      <tr>${dotCells.join("")}</tr>
      <tr>${labelCells.join("")}</tr>
    </table>`;
}

interface EmailParts {
  shop: ShopBranding;
  customerName: string;
  ticketNumber: string;
  deviceLabel: string | null;
  status: string;
}

/** Build a polished, ticket-aware HTML status email (table-based for email clients). */
export function buildStatusEmailHtml(p: EmailParts): string {
  const device = p.deviceLabel && p.deviceLabel.trim() ? p.deviceLabel : "device";
  const { headline, message } = statusContent(p.status, device);
  const tone = STATUS_TONE[p.status] ?? "slate";
  const color = TONE_COLOR[tone];
  const step = STATUS_STEP[p.status];
  const isTerminal = step === undefined;
  const shop = p.shop;
  const dateText = new Date().toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

  const progress = isTerminal ? "" : progressHtml(step, color);

  const pickupCallout =
    p.status === "Awaiting Pickup" && (shop.address || shop.phone)
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:12px 0 2px"><tr><td style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:10px;padding:14px 16px;font-size:13px;line-height:1.5;color:#166534">
          <strong>Ready when you are.</strong> Come grab your ${esc(device)}.${shop.address ? `<br/>${esc(shop.address)}` : ""}${shop.phone ? `<br/>${esc(shop.phone)}` : ""}
         </td></tr></table>`
      : "";

  const terminalCallout = isTerminal
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:12px 0 2px"><tr><td style="background:#FEF2F2;border:1px solid #FECACA;border-radius:10px;padding:14px 16px;font-size:13px;line-height:1.5;color:#991B1B">
        Please get in touch and we'll talk through the next steps.${shop.phone ? ` Call us at ${esc(shop.phone)}.` : ""}
       </td></tr></table>`
    : "";

  const deviceRow = p.deviceLabel
    ? `<tr><td style="padding:4px 16px 4px 0;color:#94A3B8;width:84px">Device</td><td style="color:#0F172A">${esc(p.deviceLabel)}</td></tr>`
    : "";

  const contactBits = [shop.phone, shop.address, shop.email]
    .filter((s) => s && s.trim())
    .map((s) => esc(s))
    .join("&nbsp;&nbsp;&middot;&nbsp;&nbsp;");

  const fontStack = "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

  return `<div style="display:none;max-height:0;overflow:hidden">${esc(headline)} - ${esc(p.ticketNumber)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F1F5FD;padding:28px 12px;font-family:${fontStack}">
<tr><td align="center">
  <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #E4ECFC;box-shadow:0 1px 2px rgba(15,23,42,0.05),0 10px 28px rgba(15,23,42,0.05)">
    <tr><td style="background:#0F172A;padding:18px 26px">
      <table role="presentation" width="100%"><tr>
        <td style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:-0.01em">${esc(shop.name)}</td>
        <td align="right" style="color:#94A3B8;font-size:12px;font-weight:500;letter-spacing:0.02em">REPAIR UPDATE</td>
      </tr></table>
    </td></tr>
    <tr><td style="padding:26px 26px 24px">
      <span style="display:inline-block;background:${color};color:#ffffff;font-size:11px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;padding:5px 12px;border-radius:999px">${esc(p.status)}</span>
      <h1 style="font-size:22px;line-height:1.3;color:#0F172A;font-weight:700;margin:16px 0 10px">${esc(headline)}</h1>
      <p style="font-size:15px;color:#475569;margin:0">Hi ${esc(p.customerName)},</p>
      <p style="font-size:15px;color:#475569;line-height:1.6;margin:8px 0 0">${esc(message)}</p>
      ${progress}
      ${pickupCallout}
      ${terminalCallout}
      <table role="presentation" width="100%" style="font-size:13px;margin-top:18px;border-top:1px solid #EEF2FB;padding-top:14px">
        <tr><td style="padding:4px 16px 4px 0;color:#94A3B8;width:84px">Ticket</td><td style="color:#0F172A;font-weight:600">${esc(p.ticketNumber)}</td></tr>
        ${deviceRow}
        <tr><td style="padding:4px 16px 4px 0;color:#94A3B8">Updated</td><td style="color:#0F172A">${dateText}</td></tr>
      </table>
    </td></tr>
    <tr><td style="background:#F8FAFF;border-top:1px solid #EEF2FB;padding:18px 26px">
      ${contactBits ? `<div style="font-size:12px;color:#64748B;line-height:1.6">${contactBits}</div>` : ""}
      <div style="font-size:11px;color:#94A3B8;margin-top:8px">This is an automated update from ${esc(shop.name)}. Please do not reply to this email.</div>
    </td></tr>
  </table>
</td></tr>
</table>`;
}

async function sendEmail(cfg: SmtpConfig, to: string, subject: string, html: string): Promise<void> {
  const shopName = useBrandStore.getState().name;
  await invoke("send_email", {
    smtpHost: cfg.host,
    smtpPort: cfg.port,
    smtpUser: cfg.user,
    smtpPass: cfg.pass,
    fromName: cfg.fromName || shopName,
    fromEmail: cfg.fromEmail || cfg.user,
    to,
    subject,
    htmlBody: html,
  });
}

export interface StatusNotifyArgs {
  customerEmail: string | null;
  customerName: string;
  ticketNumber: string;
  deviceLabel: string | null;
  status: string;
}

export interface NotifyResult {
  sent: boolean;
  queued?: boolean;
  reason?: string;
}

/**
 * Notify the customer of a status change. The email is queued first so it is
 * never lost, then sent immediately when possible; if the internet is down it
 * stays queued and the flusher delivers it once back online.
 */
export async function notifyTicketStatus(args: StatusNotifyArgs): Promise<NotifyResult> {
  const cfg = await loadSmtpConfig();
  if (!cfg.enabled) return { sent: false, reason: "disabled" };
  if (!cfg.host || !(cfg.fromEmail || cfg.user)) return { sent: false, reason: "not configured" };
  if (!cfg.statuses.includes(args.status)) return { sent: false, reason: "status off" };
  if (!args.customerEmail || !args.customerEmail.includes("@")) return { sent: false, reason: "no email" };

  const shop = await loadShopBranding();
  const device = args.deviceLabel && args.deviceLabel.trim() ? args.deviceLabel : "device";
  const { headline } = statusContent(args.status, device);
  const html = buildStatusEmailHtml({
    shop,
    customerName: args.customerName,
    ticketNumber: args.ticketNumber,
    deviceLabel: args.deviceLabel,
    status: args.status,
  });
  const subject = `${headline} - ${args.ticketNumber}`;

  const id = await enqueueEmail(args.customerEmail, subject, html);
  const ok = await trySendOutboxItem(cfg, {
    id,
    to_email: args.customerEmail,
    subject,
    html_body: html,
    status: "pending",
    attempts: 0,
  });
  return ok ? { sent: true } : { sent: false, queued: true, reason: "queued" };
}

async function trySendOutboxItem(cfg: SmtpConfig, item: OutboxEmail): Promise<boolean> {
  if (!(await claimEmail(item.id))) return false; // another flush / PC is handling it
  try {
    await sendEmail(cfg, item.to_email, item.subject, item.html_body);
    await markEmailSent(item.id);
    return true;
  } catch (e) {
    await markEmailFailed(item.id, e instanceof Error ? e.message : String(e), MAX_ATTEMPTS);
    return false;
  }
}

/**
 * Send any queued emails. Safe to call often (a no-op when nothing waits). Used
 * by the background flusher on launch and whenever the internet returns. Sends
 * even if notifications were later turned off, as long as SMTP is configured.
 */
export async function flushOutbox(): Promise<{ sent: number; remaining: number }> {
  const cfg = await loadSmtpConfig();
  if (!cfg.host || !(cfg.fromEmail || cfg.user)) {
    return { sent: 0, remaining: await pendingEmailCount() };
  }
  await resetStaleSending(new Date(Date.now() - 120000).toISOString());
  const pending = await listPendingEmails(25);
  let sent = 0;
  for (const item of pending) {
    const ok = await trySendOutboxItem(cfg, item);
    if (ok) sent++;
    else break; // likely offline; stop and retry later
  }
  return { sent, remaining: await pendingEmailCount() };
}

/** Send a sample email to a chosen address to verify the SMTP setup. */
export async function sendTestEmail(cfg: SmtpConfig, to: string): Promise<void> {
  const shop = await loadShopBranding();
  const html = buildStatusEmailHtml({
    shop,
    customerName: "there",
    ticketNumber: "RS-TEST-0001",
    deviceLabel: "iPhone 12",
    status: "Awaiting Pickup",
  });
  await sendEmail(cfg, to, `Test email from ${shop.name}`, html);
}
