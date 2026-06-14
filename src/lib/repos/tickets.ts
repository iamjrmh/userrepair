import { getOne, run, select, softDelete, tx } from "@/lib/db";
import { logActivity } from "@/lib/repos/activity";
import { getSetting } from "@/lib/repos/settings";
import { adjustStock } from "@/lib/repos/inventory";
import { htmlToText } from "@/lib/utils";
import type {
  Ticket,
  TicketNote,
  TicketTimelineEntry,
  TicketPart,
  TicketStatus,
  TicketPriority,
  TicketType,
} from "@/types";
import type { TicketInput } from "@/lib/validators";

export interface TicketRow extends Ticket {
  customer_name: string | null;
  device_label: string | null;
  technician_name: string | null;
}

const TICKET_LIST_SELECT = `
  SELECT t.*, c.name AS customer_name,
         (d.brand || ' ' || d.model) AS device_label,
         tech.name AS technician_name
  FROM tickets t
  LEFT JOIN customers c ON c.id = t.customer_id
  LEFT JOIN devices d ON d.id = t.device_id
  LEFT JOIN technicians tech ON tech.id = t.technician_id
`;

export async function listTickets(): Promise<TicketRow[]> {
  return select<TicketRow>(
    `${TICKET_LIST_SELECT} WHERE t.deleted_at IS NULL ORDER BY t.created_at DESC`,
  );
}

export async function getTicket(id: number): Promise<TicketRow | null> {
  return getOne<TicketRow>(`${TICKET_LIST_SELECT} WHERE t.id = ?1 AND t.deleted_at IS NULL`, [id]);
}

/** Generate the next ticket number: <PREFIX>-YYYYMMDD-NNNN (per-day sequence). */
async function nextTicketNumber(): Promise<string> {
  const prefix = await getSetting<string>("tickets.prefix", "RS");
  const now = new Date();
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(
    now.getDate(),
  ).padStart(2, "0")}`;
  const like = `${prefix}-${ymd}-%`;
  const row = await getOne<{ n: number }>(
    "SELECT COUNT(*) AS n FROM tickets WHERE ticket_number LIKE ?1",
    [like],
  );
  const seq = String((row?.n ?? 0) + 1).padStart(4, "0");
  return `${prefix}-${ymd}-${seq}`;
}

export async function createTicket(input: TicketInput): Promise<{ id: number; number: string }> {
  const ticketNumber = await nextTicketNumber();
  const defaultStatus = await getSetting<string>("tickets.default_status", "Intake");
  const result = await run(
    `INSERT INTO tickets
      (ticket_number, customer_id, device_id, technician_id, title, type, priority, status,
       symptom_description, due_date)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)`,
    [
      ticketNumber,
      input.customer_id,
      input.device_id,
      input.technician_id,
      input.title,
      input.type,
      input.priority,
      defaultStatus,
      input.symptom_description.trim() === "" ? null : input.symptom_description,
      input.due_date.trim() === "" ? null : input.due_date,
    ],
  );
  await run(
    "INSERT INTO ticket_timeline (ticket_id, event, to_status, detail) VALUES (?1, 'created', ?2, ?3)",
    [result.lastInsertId, defaultStatus, `Ticket ${ticketNumber} created`],
  );
  await logActivity("ticket", result.lastInsertId, "created", `Opened ${ticketNumber}: ${input.title}`);
  return { id: result.lastInsertId, number: ticketNumber };
}

export async function updateTicketFields(
  id: number,
  fields: {
    title: string;
    type: TicketType;
    priority: TicketPriority;
    technician_id: number | null;
    due_date: string | null;
    symptom_description: string | null;
    customer_notes: string | null;
  },
): Promise<void> {
  await run(
    `UPDATE tickets SET title=?1, type=?2, priority=?3, technician_id=?4, due_date=?5,
       symptom_description=?6, customer_notes=?7 WHERE id=?8`,
    [
      fields.title,
      fields.type,
      fields.priority,
      fields.technician_id,
      fields.due_date,
      fields.symptom_description,
      fields.customer_notes,
      id,
    ],
  );
}

/** Change a ticket's status, recording the transition in the timeline. */
export async function changeStatus(
  id: number,
  from: TicketStatus,
  to: TicketStatus,
  technicianId: number | null,
): Promise<void> {
  const closing = to === "Completed" || to === "Closed";
  await tx([
    {
      sql: `UPDATE tickets SET status = ?1${closing ? ", closed_at = ?3" : ""} WHERE id = ?2`,
      params: closing ? [to, id, new Date().toISOString()] : [to, id],
    },
    {
      sql: `INSERT INTO ticket_timeline (ticket_id, technician_id, event, from_status, to_status, detail)
            VALUES (?1, ?2, 'status_change', ?3, ?4, ?5)`,
      params: [id, technicianId, from, to, `${from} -> ${to}`],
    },
  ]);
  await logActivity("ticket", id, "status", `Status ${from} -> ${to}`);
}

/** Reopen a closed ticket: increment rework count and record the reason. */
export async function reopenTicket(id: number, reason: string): Promise<void> {
  await run(
    `UPDATE tickets SET status = 'In Repair', rework_count = rework_count + 1,
       reopened_reason = ?1, closed_at = NULL WHERE id = ?2`,
    [reason, id],
  );
  await run(
    "INSERT INTO ticket_timeline (ticket_id, event, to_status, detail) VALUES (?1, 'reopened', 'In Repair', ?2)",
    [id, `Reopened: ${reason}`],
  );
  await logActivity("ticket", id, "reopened", `Reopened #${id}: ${reason}`);
}

export async function deleteTicket(id: number): Promise<void> {
  await softDelete("tickets", id);
}

// --- timeline & notes --------------------------------------------------------

export async function listTimeline(ticketId: number): Promise<TicketTimelineEntry[]> {
  return select<TicketTimelineEntry>(
    "SELECT * FROM ticket_timeline WHERE ticket_id = ?1 AND deleted_at IS NULL ORDER BY created_at DESC",
    [ticketId],
  );
}

export async function listNotes(ticketId: number): Promise<TicketNote[]> {
  return select<TicketNote>(
    "SELECT * FROM ticket_notes WHERE ticket_id = ?1 AND deleted_at IS NULL ORDER BY created_at DESC",
    [ticketId],
  );
}

export async function addNote(
  ticketId: number,
  body: string,
  internal: boolean,
  technicianId: number | null,
): Promise<void> {
  await run(
    "INSERT INTO ticket_notes (ticket_id, body, internal, technician_id) VALUES (?1, ?2, ?3, ?4)",
    [ticketId, body, internal ? 1 : 0, technicianId],
  );
}

// --- parts (consume + deduct stock) ------------------------------------------

export async function listParts(ticketId: number): Promise<TicketPart[]> {
  return select<TicketPart>(
    "SELECT * FROM ticket_parts WHERE ticket_id = ?1 AND deleted_at IS NULL ORDER BY created_at",
    [ticketId],
  );
}

/** Add a part to a ticket and, if linked to stock, deduct it atomically. */
export async function consumePart(opts: {
  ticketId: number;
  itemId: number | null;
  description: string;
  quantity: number;
  unitCostCents: number;
  technicianId: number | null;
}): Promise<void> {
  await run(
    `INSERT INTO ticket_parts (ticket_id, item_id, description, quantity, unit_cost_cents, deducted)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
    [
      opts.ticketId,
      opts.itemId,
      opts.description,
      opts.quantity,
      opts.unitCostCents,
      opts.itemId ? 1 : 0,
    ],
  );
  if (opts.itemId) {
    await adjustStock({
      itemId: opts.itemId,
      delta: -Math.abs(opts.quantity),
      action: "consume",
      reason: `Consumed on ticket #${opts.ticketId}`,
      unitCostCents: opts.unitCostCents,
      technicianId: opts.technicianId,
      ticketId: opts.ticketId,
    });
  }
}

// --- labor (stored as estimate items, kind='labor') --------------------------

export interface TicketLaborLine {
  id: number;
  description: string;
  quantity: number; // hours (may be fractional)
  unit_price_cents: number; // hourly rate
}

export async function listLabor(ticketId: number): Promise<TicketLaborLine[]> {
  return select<TicketLaborLine>(
    "SELECT id, description, quantity, unit_price_cents FROM ticket_estimate_items WHERE ticket_id = ?1 AND kind = 'labor' AND deleted_at IS NULL ORDER BY id",
    [ticketId],
  );
}

/** Add a labor line: `hours` (fractional ok) billed at `rateCents` per hour. */
export async function addLaborLine(ticketId: number, hours: number, rateCents: number): Promise<void> {
  await run(
    "INSERT INTO ticket_estimate_items (ticket_id, kind, description, quantity, unit_price_cents) VALUES (?1, 'labor', 'Labor', ?2, ?3)",
    [ticketId, hours, rateCents],
  );
}

export async function deleteEstimateItem(id: number): Promise<void> {
  await softDelete("ticket_estimate_items", id);
}

/** Mark a ticket completed (used when it is rung out at POS). */
export async function markTicketCompleted(id: number): Promise<void> {
  await tx([
    { sql: "UPDATE tickets SET status = 'Completed', closed_at = ?1 WHERE id = ?2", params: [new Date().toISOString(), id] },
    {
      sql: "INSERT INTO ticket_timeline (ticket_id, event, to_status, detail) VALUES (?1, 'status_change', 'Completed', 'Rung out at POS')",
      params: [id],
    },
  ]);
  await logActivity("ticket", id, "status", "Completed (POS)");
}

// --- dashboard helpers -------------------------------------------------------

export async function statusCounts(): Promise<{ status: string; n: number }[]> {
  return select<{ status: string; n: number }>(
    `SELECT status, COUNT(*) AS n FROM tickets WHERE deleted_at IS NULL GROUP BY status`,
  );
}

export async function openTicketCount(): Promise<number> {
  const row = await getOne<{ n: number }>(
    `SELECT COUNT(*) AS n FROM tickets
     WHERE deleted_at IS NULL AND status NOT IN ('Completed','Closed','Customer Declined')`,
  );
  return row?.n ?? 0;
}

export async function dueTodayCount(): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const row = await getOne<{ n: number }>(
    `SELECT COUNT(*) AS n FROM tickets
     WHERE deleted_at IS NULL AND due_date IS NOT NULL AND substr(due_date,1,10) <= ?1
       AND status NOT IN ('Completed','Closed')`,
    [today],
  );
  return row?.n ?? 0;
}

/** Plain-text symptom preview for list views (strips rich-text markup). */
export function symptomPreview(html: string | null): string {
  if (!html) return "";
  const text = htmlToText(html);
  return text.length > 80 ? `${text.slice(0, 80)}...` : text;
}
