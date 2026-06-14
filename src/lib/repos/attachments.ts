import { invoke } from "@tauri-apps/api/core";
import { run, select } from "@/lib/db";

interface StoredAttachment {
  relative_path: string;
  sha256: string;
  size: number;
  deduped: boolean;
}

export interface TicketAttachmentRow {
  id: number;
  ticket_id: number;
  category: string;
  original_name: string;
  relative_path: string;
  sha256: string | null;
  size_bytes: number;
  caption: string | null;
  created_at: string;
}

/**
 * Copy a local file (e.g. a microscope snapshot) into the app's attachment
 * store and link it to a ticket. The file is content-hashed and deduped by the
 * native attachment_store command.
 */
export async function attachFileToTicket(
  ticketId: number,
  sourcePath: string,
  originalName: string,
  category = "general",
): Promise<void> {
  const stored = await invoke<StoredAttachment>("attachment_store", {
    sourcePath,
    subdir: "tickets",
  });
  await run(
    `INSERT INTO ticket_attachments (ticket_id, category, original_name, relative_path, sha256, size_bytes)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
    [ticketId, category, originalName, stored.relative_path, stored.sha256, stored.size],
  );
}

export async function listTicketAttachments(ticketId: number): Promise<TicketAttachmentRow[]> {
  return select<TicketAttachmentRow>(
    "SELECT * FROM ticket_attachments WHERE ticket_id = ?1 AND deleted_at IS NULL ORDER BY created_at DESC",
    [ticketId],
  );
}

export async function deleteTicketAttachment(id: number): Promise<void> {
  await run("UPDATE ticket_attachments SET deleted_at = ?1 WHERE id = ?2", [
    new Date().toISOString(),
    id,
  ]);
}
