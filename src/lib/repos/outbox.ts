/**
 * Notification email outbox (see migration 0016). Emails are enqueued, sent when
 * possible, and retried by a background flusher when the internet returns. The
 * 'sending' claim is atomic on the shared DB so two PCs never send the same one.
 */
import { run, select, getOne } from "@/lib/db";

export interface OutboxEmail {
  id: number;
  to_email: string;
  subject: string;
  html_body: string;
  status: string;
  attempts: number;
  is_html: number;
  /** 'smtp' (the shop's own server) or 'pingram' (per-user verified sender). */
  channel: string;
  from_name: string;
  from_addr: string;
}

export interface EnqueueOpts {
  isHtml?: boolean;
  channel?: string;
  fromName?: string;
  fromAddr?: string;
}

export async function enqueueEmail(
  to: string,
  subject: string,
  body: string,
  opts: EnqueueOpts = {},
): Promise<number> {
  const { isHtml = true, channel = "smtp", fromName = "", fromAddr = "" } = opts;
  const r = await run(
    "INSERT INTO notification_outbox (to_email, subject, html_body, is_html, channel, from_name, from_addr) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
    [to, subject, body, isHtml ? 1 : 0, channel, fromName, fromAddr],
  );
  return r.lastInsertId;
}

/** Atomically claim a pending email for sending. Returns false if already taken. */
export async function claimEmail(id: number): Promise<boolean> {
  const r = await run(
    "UPDATE notification_outbox SET status = 'sending', updated_at = ?1 WHERE id = ?2 AND status = 'pending'",
    [new Date().toISOString(), id],
  );
  return r.rowsAffected > 0;
}

export async function markEmailSent(id: number): Promise<void> {
  const now = new Date().toISOString();
  await run(
    "UPDATE notification_outbox SET status = 'sent', sent_at = ?1, updated_at = ?1 WHERE id = ?2",
    [now, id],
  );
}

/** Record a failed attempt: back to pending for retry, or 'failed' once exhausted. */
export async function markEmailFailed(id: number, error: string, maxAttempts: number): Promise<void> {
  await run(
    `UPDATE notification_outbox
       SET attempts = attempts + 1,
           status = CASE WHEN attempts + 1 >= ?3 THEN 'failed' ELSE 'pending' END,
           last_error = ?1,
           updated_at = ?2
     WHERE id = ?4`,
    [error.slice(0, 300), new Date().toISOString(), maxAttempts, id],
  );
}

export async function listPendingEmails(limit: number): Promise<OutboxEmail[]> {
  return select<OutboxEmail>(
    "SELECT id, to_email, subject, html_body, status, attempts, is_html, channel, from_name, from_addr FROM notification_outbox WHERE status = 'pending' ORDER BY created_at LIMIT ?1",
    [limit],
  );
}

/** Recover emails left 'sending' by a crashed/closed app, after a grace period. */
export async function resetStaleSending(olderThanIso: string): Promise<void> {
  await run(
    "UPDATE notification_outbox SET status = 'pending', updated_at = ?1 WHERE status = 'sending' AND updated_at < ?2",
    [new Date().toISOString(), olderThanIso],
  );
}

export async function pendingEmailCount(): Promise<number> {
  const row = await getOne<{ n: number }>(
    "SELECT COUNT(*) AS n FROM notification_outbox WHERE status = 'pending'",
  );
  return row?.n ?? 0;
}
