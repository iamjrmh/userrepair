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
}

export async function enqueueEmail(
  to: string,
  subject: string,
  body: string,
  isHtml = true,
): Promise<number> {
  const r = await run(
    "INSERT INTO notification_outbox (to_email, subject, html_body, is_html) VALUES (?1, ?2, ?3, ?4)",
    [to, subject, body, isHtml ? 1 : 0],
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
    "SELECT id, to_email, subject, html_body, status, attempts, is_html FROM notification_outbox WHERE status = 'pending' ORDER BY created_at LIMIT ?1",
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
