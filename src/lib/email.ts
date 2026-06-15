/**
 * Repair-status email notifications. Configuration is stored in app settings and
 * sent through the native `send_email` command (SMTP). All sends are best-effort:
 * a status change still succeeds even if the email does not.
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

const STATUS_HEADLINE: Record<string, string> = {
  Intake: "We received your device",
  Diagnosed: "We finished diagnosing your device",
  "Awaiting Parts": "We are waiting on parts for your repair",
  "In Repair": "Your repair is in progress",
  QC: "Your repair is in final testing",
  "Awaiting Pickup": "Your device is ready for pickup",
  Completed: "Your repair is complete",
  Closed: "Your repair is complete",
  "Unrepairable (BER)": "An update on your device",
};

const STATUS_MESSAGE: Record<string, string> = {
  Intake: "Your device has been checked in and is in our queue.",
  Diagnosed: "We have diagnosed the issue and are moving forward with the repair.",
  "Awaiting Parts": "We have ordered the parts needed and will continue as soon as they arrive.",
  "In Repair": "Our technician is actively working on your device.",
  QC: "The repair is done and we are running final quality checks.",
  "Awaiting Pickup": "Your device is repaired and ready to pick up at your convenience.",
  Completed: "Your repair is complete. Thank you for choosing us.",
  Closed: "Your repair is complete. Thank you for choosing us.",
  "Unrepairable (BER)": "Please get in touch with us about the status of your device.",
};

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

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface EmailParts {
  shopName: string;
  customerName: string;
  ticketNumber: string;
  deviceLabel: string | null;
  status: string;
}

/** Build a clean, inline-styled HTML email for a status update. */
export function buildStatusEmailHtml(p: EmailParts): string {
  const headline = STATUS_HEADLINE[p.status] ?? "An update on your repair";
  const message = STATUS_MESSAGE[p.status] ?? `Your repair status is now: ${p.status}.`;
  const shop = esc(p.shopName);
  const deviceRow = p.deviceLabel
    ? `<tr><td style="padding:2px 14px 2px 0;color:#888">Device</td><td>${esc(p.deviceLabel)}</td></tr>`
    : "";
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#1a1a1a">
  <div style="background:#7C3AED;color:#fff;padding:16px 20px;border-radius:8px 8px 0 0">
    <div style="font-size:18px;font-weight:700">${shop}</div>
  </div>
  <div style="border:1px solid #e6e6e6;border-top:none;padding:20px;border-radius:0 0 8px 8px">
    <p style="margin:0 0 6px">Hi ${esc(p.customerName)},</p>
    <h2 style="font-size:17px;margin:10px 0 6px">${esc(headline)}</h2>
    <p style="color:#444;margin:0 0 14px">${esc(message)}</p>
    <table style="font-size:14px;color:#444;border-collapse:collapse">
      <tr><td style="padding:2px 14px 2px 0;color:#888">Ticket</td><td>${esc(p.ticketNumber)}</td></tr>
      ${deviceRow}
      <tr><td style="padding:2px 14px 2px 0;color:#888">Status</td><td>${esc(p.status)}</td></tr>
    </table>
    <p style="margin-top:18px;color:#999;font-size:12px">This is an automated update from ${shop}. Please do not reply to this email.</p>
  </div>
</div>`;
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

  const shopName = useBrandStore.getState().name;
  const headline = STATUS_HEADLINE[args.status] ?? "An update on your repair";
  const html = buildStatusEmailHtml({
    shopName,
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
  const shopName = useBrandStore.getState().name;
  const html = buildStatusEmailHtml({
    shopName,
    customerName: "there",
    ticketNumber: "RS-TEST-0001",
    deviceLabel: "iPhone 12",
    status: "Awaiting Pickup",
  });
  await sendEmail(cfg, to, `Test email from ${shopName}`, html);
}
