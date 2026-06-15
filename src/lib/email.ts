/**
 * Repair-status email notifications. Configuration is stored in app settings and
 * sent through the native `send_email` command (SMTP). Sends are queued in the
 * outbox first so a status update is never lost when the internet is down.
 */
import { invoke } from "@tauri-apps/api/core";
import { getSetting } from "@/lib/repos/settings";
import { useBrandStore } from "@/stores/brand";
import { useAuthStore } from "@/stores/auth";
import type { TechRole } from "@/types";
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
  /** Email-to-SMS carrier-gateway backup. */
  smsEnabled: boolean;
  host: string;
  port: number;
  user: string;
  pass: string;
  fromName: string;
  fromEmail: string;
  statuses: string[];
  // Pingram (real A2P 10DLC SMS), the primary text channel.
  pingramEnabled: boolean;
  /** Server API key (looks like pingram_sk_...). */
  pingramApiKey: string;
  /** The notification "type" created in Pingram with the SMS/Email channels enabled. */
  pingramType: string;
  pingramBaseUrl: string;
  // Pingram email: send status emails from each user's address on a verified domain.
  pingramEmailEnabled: boolean;
  /** The verified sending domain, e.g. "iamjrmh.xyz" (sender becomes username@domain). */
  pingramSenderDomain: string;
  // Inbound webhook (Inbox). A dedicated token, separate from the LAN access key.
  /** Optional secret required on the inbound webhook URL (blank = open). */
  inboundToken: string;
  /** Optional public base URL of this PC (e.g. a Cloudflare Tunnel) for the webhook display. */
  publicBaseUrl: string;
}

export const PINGRAM_DEFAULT_BASE_URL = "https://api.pingram.io";
export const PINGRAM_DEFAULT_TYPE = "repair_status_update";
export const PINGRAM_DEFAULT_SENDER_DOMAIN = "iamjrmh.xyz";

/**
 * Carrier email-to-SMS gateways (US + Canada), de-duplicated to one address per
 * carrier where possible. A phone number belongs to exactly one carrier, so a
 * message sprayed to all of these is only delivered by the customer's real
 * carrier; the rest drop or bounce. Lets us text without knowing the carrier.
 */
export const SMS_GATEWAYS = [
  // United States
  "vtext.com", // Verizon (+ Visible, Xfinity Mobile, Spectrum Mobile, Total, Straight Talk/TracFone on Verizon)
  "vzwpix.com", // Verizon MMS
  "txt.att.net", // AT&T
  "mms.att.net", // AT&T MMS
  "tmomail.net", // T-Mobile (+ Metro, Mint, Ultra, and most T-Mobile MVNOs)
  "messaging.sprintpcs.com", // Sprint (legacy)
  "email.uscc.net", // US Cellular
  "sms.cricketwireless.net", // Cricket
  "mms.cricketwireless.net", // Cricket MMS
  "mymetropcs.com", // Metro by T-Mobile
  "msg.fi.google.com", // Google Fi
  "sms.myboostmobile.com", // Boost Mobile
  "myboostmobile.com", // Boost MMS
  "message.ting.com", // Ting
  "vmobl.com", // Virgin Mobile USA (legacy)
  // Canada
  "pcs.rogers.com", // Rogers
  "fido.ca", // Fido
  "msg.telus.com", // Telus (+ Koodo, Public Mobile)
  "txt.bell.ca", // Bell
  "vmobile.ca", // Virgin Mobile Canada
  "txt.freedommobile.ca", // Freedom Mobile
  "sms.sasktel.com", // SaskTel
];

/** Reduce a phone string to its 10-digit local number (drops a leading US/CA 1). */
function normalizePhone(phone: string): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  return digits.length === 10 ? digits : "";
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
  const [
    enabled, smsEnabled, host, port, user, pass, fromName, fromEmail, statuses,
    pingramEnabled, pingramApiKey, pingramType, pingramBaseUrl,
    pingramEmailEnabled, pingramSenderDomain, inboundToken, publicBaseUrl,
  ] = await Promise.all([
    getSetting<boolean>("notify.enabled", false),
    getSetting<boolean>("notify.sms_enabled", false),
    getSetting<string>("notify.smtp_host", "smtp.gmail.com"),
    getSetting<number>("notify.smtp_port", 587),
    getSetting<string>("notify.smtp_user", ""),
    getSetting<string>("notify.smtp_pass", ""),
    getSetting<string>("notify.from_name", ""),
    getSetting<string>("notify.from_email", ""),
    getSetting<string[]>("notify.statuses", DEFAULT_NOTIFY_STATUSES),
    getSetting<boolean>("notify.pingram_enabled", false),
    getSetting<string>("notify.pingram_api_key", ""),
    getSetting<string>("notify.pingram_type", PINGRAM_DEFAULT_TYPE),
    getSetting<string>("notify.pingram_base_url", PINGRAM_DEFAULT_BASE_URL),
    getSetting<boolean>("notify.pingram_email_enabled", false),
    getSetting<string>("notify.pingram_sender_domain", PINGRAM_DEFAULT_SENDER_DOMAIN),
    getSetting<string>("notify.inbound_token", ""),
    getSetting<string>("notify.public_base_url", ""),
  ]);
  return {
    enabled, smsEnabled, host, port: port || 587, user, pass, fromName, fromEmail, statuses,
    pingramEnabled, pingramApiKey, pingramType: pingramType || PINGRAM_DEFAULT_TYPE,
    pingramBaseUrl: pingramBaseUrl || PINGRAM_DEFAULT_BASE_URL,
    pingramEmailEnabled, pingramSenderDomain: pingramSenderDomain || PINGRAM_DEFAULT_SENDER_DOMAIN,
    inboundToken, publicBaseUrl,
  };
}

/** Human label for a role, e.g. "owner" -> "Owner". */
function roleLabel(role: TechRole): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export interface EmailSender {
  name: string; // "Jeremiah (Owner)"
  address: string; // "JURMR@iamjrmh.xyz"
}

/**
 * The per-user sender for Pingram emails, derived from the signed-in user and the
 * shop's verified domain: address = username@domain, name = "Name (Role)". Returns
 * null when there's no signed-in user or no domain configured.
 */
export function currentEmailSender(domain: string): EmailSender | null {
  const user = useAuthStore.getState().user;
  const d = domain.trim().replace(/^@+/, "");
  if (!user || !user.username || !d) return null;
  return { name: `${user.name} (${roleLabel(user.role)})`, address: `${user.username.trim()}@${d}` };
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

async function sendEmail(cfg: SmtpConfig, to: string, subject: string, body: string, isHtml: boolean): Promise<void> {
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
    body,
    isHtml,
  });
}

/**
 * A clean, professional multi-line plain-text status message (no media). Mirrors
 * the spirit of the email: shop name, a clear sentence, ticket id, the time, and
 * the shop's address and phone. Used by both Pingram and the email-to-SMS backup.
 */
function buildSmsText(shop: ShopBranding, status: string, device: string, ticketNumber: string): string {
  const sentences: Record<string, string> = {
    Intake: `We received your ${device} and it is in our queue.`,
    Diagnosed: `We've diagnosed your ${device} and are moving forward.`,
    "Awaiting Parts": `We're waiting on parts for your ${device}.`,
    "In Repair": `Your ${device} repair is underway.`,
    QC: `Your ${device} is in final testing.`,
    "Awaiting Pickup": `Your ${device} is repaired and ready for pickup.`,
    Completed: `Your ${device} repair is complete. Thank you!`,
    Closed: `Your ${device} repair is complete. Thank you!`,
    "Unrepairable (BER)": `An update on your ${device} - please give us a call.`,
  };
  const sentence = sentences[status] ?? `Your repair status is now ${status}.`;
  const timeLabel =
    status === "Completed" || status === "Closed"
      ? "Completed"
      : status === "Awaiting Pickup"
        ? "Ready"
        : "Updated";
  const time = new Date().toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  const lines = [shop.name, "", sentence, "", `Ticket: ${ticketNumber}`, `${timeLabel}: ${time}`];
  if (shop.address) lines.push(shop.address);
  lines.push("");
  lines.push(
    shop.phone
      ? `Questions? Just reply to this text. For anything urgent, call ${shop.phone}.`
      : "Questions? Just reply to this text and we'll get back to you.",
  );
  return lines.join("\n");
}

/**
 * The message Pingram auto-sends back the moment a customer replies to an update,
 * so they're never left wondering whether anyone saw it.
 */
function buildAutoReply(shop: ShopBranding): string {
  const urgent: string[] = [];
  if (shop.phone) urgent.push(`call ${shop.phone}`);
  if (shop.email) urgent.push(`email ${shop.email}`);
  const tail = urgent.length ? ` If it's urgent, ${urgent.join(" or ")}.` : "";
  return `Thanks for your message! We check these often and will get back to you soon, so please be patient.${tail}`;
}

/** Reduce a phone string to E.164 (+1XXXXXXXXXX) for US/Canada, or "" if invalid. */
function normalizePhoneE164(phone: string): string {
  const d = normalizePhone(phone);
  return d ? `+1${d}` : "";
}

/** Send one SMS through Pingram (real A2P 10DLC carrier SMS). */
async function sendPingramSms(
  cfg: SmtpConfig,
  e164: string,
  message: string,
  autoReply?: string,
): Promise<void> {
  await invoke("send_pingram", {
    baseUrl: cfg.pingramBaseUrl,
    apiKey: cfg.pingramApiKey,
    notificationType: cfg.pingramType,
    toNumber: e164,
    message,
    autoReply: autoReply ?? null,
  });
}

/** True when Pingram has everything it needs to send a text. */
function pingramReady(cfg: SmtpConfig): boolean {
  return cfg.pingramEnabled && !!cfg.pingramApiKey && !!cfg.pingramType;
}

/** True when Pingram email is enabled and configured (key, type, domain). */
function pingramEmailReady(cfg: SmtpConfig): boolean {
  return cfg.pingramEmailEnabled && !!cfg.pingramApiKey && !!cfg.pingramType && !!cfg.pingramSenderDomain;
}

/** True when the shop's own SMTP server is configured. */
function smtpReady(cfg: SmtpConfig): boolean {
  return !!cfg.host && !!(cfg.fromEmail || cfg.user);
}

/** Send one email through Pingram (uses the shop's verified sending domain). */
async function sendPingramEmail(
  cfg: SmtpConfig,
  to: string,
  subject: string,
  html: string,
  fromName: string,
  fromAddr: string,
): Promise<void> {
  await invoke("send_pingram_email", {
    baseUrl: cfg.pingramBaseUrl,
    apiKey: cfg.pingramApiKey,
    notificationType: cfg.pingramType,
    to,
    subject,
    html,
    fromName: fromName || null,
    fromAddress: fromAddr || null,
    replyTo: fromAddr || null,
  });
}

export interface StatusNotifyArgs {
  customerEmail: string | null;
  customerPhone: string | null;
  /** Customer's preferred contact method ("phone" | "email" | "sms"). SMS only sends when "sms". */
  preferredContact: string | null;
  customerName: string;
  ticketNumber: string;
  /** The ticket's title (its "name"), used to build the email subject. */
  ticketTitle: string | null;
  deviceLabel: string | null;
  status: string;
}

export interface NotifyResult {
  sent: boolean;
  queued?: boolean;
  smsSent?: boolean;
  smsQueued?: boolean;
  reason?: string;
}

/**
 * Notify the customer of a status change by email and/or carrier email-to-SMS.
 * Everything is queued first so nothing is lost, then sent immediately when
 * possible; if the internet is down it stays queued and the flusher delivers it
 * once back online.
 */
export async function notifyTicketStatus(args: StatusNotifyArgs): Promise<NotifyResult> {
  const cfg = await loadSmtpConfig();
  // Gate: the status must be opted in, and at least one transport configured.
  if (!cfg.statuses.includes(args.status)) return { sent: false, reason: "status off" };
  if (!pingramEmailReady(cfg) && !smtpReady(cfg) && !pingramReady(cfg)) {
    return { sent: false, reason: "not configured" };
  }

  const shop = await loadShopBranding();
  const device = args.deviceLabel && args.deviceLabel.trim() ? args.deviceLabel : "device";

  let result: NotifyResult = { sent: false, reason: "nothing to send" };

  // Email channel. Prefers Pingram (per-user verified sender); falls back to the
  // shop's own SMTP server when Pingram email is off.
  if (cfg.enabled && args.customerEmail && args.customerEmail.includes("@")) {
    const html = buildStatusEmailHtml({
      shop,
      customerName: args.customerName,
      ticketNumber: args.ticketNumber,
      deviceLabel: args.deviceLabel,
      status: args.status,
    });
    // Subject is the ticket's name and its ID, e.g. "Screen replacement - RS-0042".
    const ticketName = args.ticketTitle && args.ticketTitle.trim() ? args.ticketTitle.trim() : statusContent(args.status, device).headline;
    const subject = `${ticketName} - ${args.ticketNumber}`;

    const usePingram = pingramEmailReady(cfg);
    const sender = usePingram ? currentEmailSender(cfg.pingramSenderDomain) : null;
    // Pingram needs a signed-in user to derive the sender; otherwise use SMTP.
    if (usePingram && sender) {
      const id = await enqueueEmail(args.customerEmail, subject, html, {
        channel: "pingram", fromName: sender.name, fromAddr: sender.address,
      });
      const ok = await trySendOutboxItem(cfg, {
        id, to_email: args.customerEmail, subject, html_body: html, status: "pending", attempts: 0, is_html: 1,
        channel: "pingram", from_name: sender.name, from_addr: sender.address,
      });
      result = ok ? { sent: true } : { sent: false, queued: true, reason: "queued" };
    } else if (smtpReady(cfg)) {
      const id = await enqueueEmail(args.customerEmail, subject, html, { channel: "smtp" });
      const ok = await trySendOutboxItem(cfg, {
        id, to_email: args.customerEmail, subject, html_body: html, status: "pending", attempts: 0, is_html: 1,
        channel: "smtp", from_name: "", from_addr: "",
      });
      result = ok ? { sent: true } : { sent: false, queued: true, reason: "queued" };
    }
  }

  // Text channel: only when the customer's preferred contact method is SMS.
  if (args.preferredContact === "sms" && args.customerPhone) {
    const text = buildSmsText(shop, args.status, device, args.ticketNumber);
    let smsSent = false;

    // Primary: Pingram (real A2P 10DLC carrier SMS). Carries an auto-reply so a
    // customer who texts back gets an instant, reassuring acknowledgement.
    if (pingramReady(cfg)) {
      const e164 = normalizePhoneE164(args.customerPhone);
      if (e164) {
        try {
          await sendPingramSms(cfg, e164, text, buildAutoReply(shop));
          smsSent = true;
          result.smsSent = true;
        } catch {
          smsSent = false; // fall through to the backup below
        }
      }
    }

    // Backup: email-to-SMS carrier spray (queued, offline-tolerant).
    if (!smsSent && cfg.smsEnabled) {
      const digits = normalizePhone(args.customerPhone);
      if (digits) {
        for (const domain of SMS_GATEWAYS) {
          await enqueueEmail(`${digits}@${domain}`, "", text, { isHtml: false, channel: "smtp" });
        }
        result.smsQueued = true;
        void flushOutbox();
      }
    }
  }

  return result;
}

async function trySendOutboxItem(cfg: SmtpConfig, item: OutboxEmail): Promise<boolean> {
  if (!(await claimEmail(item.id))) return false; // another flush / PC is handling it
  try {
    if (item.channel === "pingram") {
      await sendPingramEmail(cfg, item.to_email, item.subject, item.html_body, item.from_name, item.from_addr);
    } else {
      await sendEmail(cfg, item.to_email, item.subject, item.html_body, item.is_html !== 0);
    }
    await markEmailSent(item.id);
    return true;
  } catch (e) {
    await markEmailFailed(item.id, e instanceof Error ? e.message : String(e), MAX_ATTEMPTS);
    return false;
  }
}

/**
 * Send any queued items. Safe to call often (a no-op when nothing waits). Used by
 * the background flusher on launch and whenever the internet returns. Sends even
 * if notifications were later turned off, as long as a transport is configured.
 */
export async function flushOutbox(): Promise<{ sent: number; remaining: number }> {
  const cfg = await loadSmtpConfig();
  if (!smtpReady(cfg) && !pingramEmailReady(cfg)) {
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

/** Send a sample email to verify the setup (via Pingram when enabled, else SMTP). */
export async function sendTestEmail(cfg: SmtpConfig, to: string): Promise<void> {
  const shop = await loadShopBranding();
  const html = buildStatusEmailHtml({
    shop,
    customerName: "there",
    ticketNumber: "RS-TEST-0001",
    deviceLabel: "iPhone 12",
    status: "Awaiting Pickup",
  });
  const subject = `Test email from ${shop.name}`;
  if (pingramEmailReady(cfg)) {
    const sender = currentEmailSender(cfg.pingramSenderDomain);
    if (!sender) throw new Error("Sign in first - the sender is your account's username@domain");
    await sendPingramEmail(cfg, to, subject, html, sender.name, sender.address);
    return;
  }
  await sendEmail(cfg, to, subject, html, true);
}

/** Send a manager's reply (free text) to a customer via Pingram. Used by the Inbox. */
export async function sendPingramReply(phone: string, message: string): Promise<void> {
  const cfg = await loadSmtpConfig();
  if (!pingramReady(cfg)) {
    throw new Error("Pingram texting is not set up in Settings -> Notifications");
  }
  const e164 = normalizePhoneE164(phone);
  if (!e164) throw new Error("Invalid phone number");
  await sendPingramSms(cfg, e164, message);
}

/**
 * Reply to an inbox message on its own channel: a text reply for SMS, or an email
 * (from the signed-in user) for an email reply.
 */
export async function sendInboxReply(channel: string, to: string, message: string): Promise<void> {
  if (channel === "email") {
    const cfg = await loadSmtpConfig();
    if (!pingramEmailReady(cfg)) throw new Error("Pingram email is not set up in Settings -> Notifications");
    const sender = currentEmailSender(cfg.pingramSenderDomain);
    if (!sender) throw new Error("Sign in first - replies are sent from your account's address");
    const shop = await loadShopBranding();
    const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;color:#0F172A;line-height:1.6;white-space:pre-wrap">${esc(message)}</div>`;
    await sendPingramEmail(cfg, to, `Re: your message to ${shop.name}`, html, sender.name, sender.address);
    return;
  }
  await sendPingramReply(to, message);
}

/** Send a sample text via Pingram (real SMS) to verify the Pingram setup. */
export async function sendTestPingram(cfg: SmtpConfig, phone: string): Promise<void> {
  const e164 = normalizePhoneE164(phone);
  if (!e164) throw new Error("Enter a 10-digit US/Canada mobile number");
  const shop = await loadShopBranding();
  const text = buildSmsText(shop, "Awaiting Pickup", "iPhone 12", "RS-TEST-0001");
  await sendPingramSms(cfg, e164, text);
}

/** Spray a sample text to every carrier gateway for a phone number, to test the email-to-SMS backup. */
export async function sendTestSms(cfg: SmtpConfig, phone: string): Promise<number> {
  const digits = normalizePhone(phone);
  if (!digits) throw new Error("Enter a 10-digit US/Canada mobile number");
  const shop = await loadShopBranding();
  const text = buildSmsText(shop, "Awaiting Pickup", "iPhone 12", "RS-TEST-0001");
  let sent = 0;
  for (const domain of SMS_GATEWAYS) {
    try {
      await sendEmail(cfg, `${digits}@${domain}`, "", text, false);
      sent++;
    } catch {
      // Wrong-carrier gateways bounce/reject; ignore and keep trying the rest.
    }
  }
  return sent;
}
