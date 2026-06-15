import { run, select, getOne } from "@/lib/db";

export interface InboxMessage {
  id: number;
  channel: string;
  from_addr: string;
  from_name: string | null;
  customer_id: number | null;
  body: string;
  is_read: number;
  created_at: string;
}

export async function listInboxMessages(): Promise<InboxMessage[]> {
  return select<InboxMessage>("SELECT * FROM inbox_messages ORDER BY created_at DESC LIMIT 500");
}

export async function inboxUnreadCount(): Promise<number> {
  const row = await getOne<{ n: number }>("SELECT COUNT(*) AS n FROM inbox_messages WHERE is_read = 0");
  return row?.n ?? 0;
}

export async function markInboxRead(id: number): Promise<void> {
  await run("UPDATE inbox_messages SET is_read = 1 WHERE id = ?1", [id]);
}

export async function markAllInboxRead(): Promise<void> {
  await run("UPDATE inbox_messages SET is_read = 1 WHERE is_read = 0", []);
}

export async function deleteInboxMessage(id: number): Promise<void> {
  await run("DELETE FROM inbox_messages WHERE id = ?1", [id]);
}
