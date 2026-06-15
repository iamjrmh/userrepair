import { run, select, getOne } from "@/lib/db";

export interface InboxMessage {
  id: number;
  channel: string;
  from_addr: string;
  from_name: string | null;
  customer_id: number | null;
  body: string;
  is_read: number;
  /** 'in' = received from the customer; 'out' = a reply staff sent back. */
  direction: string;
  created_at: string;
}

export async function listInboxMessages(): Promise<InboxMessage[]> {
  return select<InboxMessage>("SELECT * FROM inbox_messages ORDER BY created_at DESC LIMIT 1000");
}

export async function inboxUnreadCount(): Promise<number> {
  const row = await getOne<{ n: number }>(
    "SELECT COUNT(*) AS n FROM inbox_messages WHERE is_read = 0 AND direction = 'in'",
  );
  return row?.n ?? 0;
}

export async function markInboxRead(id: number): Promise<void> {
  await run("UPDATE inbox_messages SET is_read = 1 WHERE id = ?1", [id]);
}

/** Mark every inbound message from one contact as read (opening a conversation). */
export async function markContactRead(fromAddr: string): Promise<void> {
  await run(
    "UPDATE inbox_messages SET is_read = 1 WHERE from_addr = ?1 AND direction = 'in' AND is_read = 0",
    [fromAddr],
  );
}

export async function markAllInboxRead(): Promise<void> {
  await run("UPDATE inbox_messages SET is_read = 1 WHERE is_read = 0", []);
}

export async function deleteInboxMessage(id: number): Promise<void> {
  await run("DELETE FROM inbox_messages WHERE id = ?1", [id]);
}

/** Delete an entire conversation (all messages to/from one contact). */
export async function deleteContact(fromAddr: string): Promise<void> {
  await run("DELETE FROM inbox_messages WHERE from_addr = ?1", [fromAddr]);
}

/** Record a staff reply so it shows in the thread (already marked read). */
export async function addOutboundReply(
  channel: string,
  toAddr: string,
  customerId: number | null,
  body: string,
): Promise<void> {
  await run(
    "INSERT INTO inbox_messages (channel, from_addr, from_name, customer_id, body, is_read, direction) VALUES (?1, ?2, NULL, ?3, ?4, 1, 'out')",
    [channel, toAddr, customerId, body],
  );
}
