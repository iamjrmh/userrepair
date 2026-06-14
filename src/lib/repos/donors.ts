import { run, select, softDelete } from "@/lib/db";
import type { DonorBoard, DonorComponent } from "@/types";

export async function listDonorBoards(): Promise<DonorBoard[]> {
  return select<DonorBoard>(
    "SELECT * FROM donor_boards WHERE deleted_at IS NULL ORDER BY created_at DESC",
  );
}

export async function createDonorBoard(input: {
  brand: string;
  model: string;
  board_revision: string | null;
  condition: string;
  source: string | null;
  purchase_cents: number;
  notes: string | null;
}): Promise<number> {
  const r = await run(
    `INSERT INTO donor_boards (brand, model, board_revision, condition, source, purchase_cents, notes)
     VALUES (?1,?2,?3,?4,?5,?6,?7)`,
    [
      input.brand,
      input.model,
      input.board_revision,
      input.condition,
      input.source,
      input.purchase_cents,
      input.notes,
    ],
  );
  return r.lastInsertId;
}

export async function setDepleted(id: number, depleted: boolean): Promise<void> {
  await run("UPDATE donor_boards SET depleted = ?1 WHERE id = ?2", [depleted ? 1 : 0, id]);
}

export async function deleteDonorBoard(id: number): Promise<void> {
  await softDelete("donor_boards", id);
}

export async function listComponents(boardId: number): Promise<DonorComponent[]> {
  return select<DonorComponent>(
    "SELECT * FROM donor_components WHERE donor_board_id = ?1 AND deleted_at IS NULL ORDER BY reference_designator",
    [boardId],
  );
}

export async function addComponent(input: {
  donor_board_id: number;
  component_type: string;
  reference_designator: string | null;
  value: string | null;
  part_number: string | null;
  quantity: number;
  condition: string;
}): Promise<void> {
  await run(
    `INSERT INTO donor_components
      (donor_board_id, component_type, reference_designator, value, part_number, quantity, condition)
     VALUES (?1,?2,?3,?4,?5,?6,?7)`,
    [
      input.donor_board_id,
      input.component_type,
      input.reference_designator,
      input.value,
      input.part_number,
      input.quantity,
      input.condition,
    ],
  );
}

/** Remaining value of a donor board: purchase price minus components used. */
export async function donorRemainingValue(boardId: number, purchaseCents: number): Promise<number> {
  const row = await select<{ used: number }>(
    "SELECT COUNT(*) AS used FROM donor_components WHERE donor_board_id = ?1 AND used_ticket_id IS NOT NULL AND deleted_at IS NULL",
    [boardId],
  );
  const used = row[0]?.used ?? 0;
  const total = await select<{ total: number }>(
    "SELECT COUNT(*) AS total FROM donor_components WHERE donor_board_id = ?1 AND deleted_at IS NULL",
    [boardId],
  );
  const totalComponents = total[0]?.total ?? 0;
  if (totalComponents === 0) return purchaseCents;
  return Math.round(purchaseCents * (1 - used / totalComponents));
}
