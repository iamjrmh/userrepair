import { invoke } from "@tauri-apps/api/core";
import { getOne, run, select, softDelete } from "@/lib/db";
import type { BoardRevision } from "@/types";

// --- boardview / schematic attachments per revision --------------------------

export interface BoardAttachment {
  id: number;
  board_revision_id: number;
  original_name: string;
  relative_path: string;
  kind: string;
  size_bytes: number;
}

interface StoredAttachment {
  relative_path: string;
  sha256: string;
  size: number;
}

export async function listBoardAttachments(boardId: number): Promise<BoardAttachment[]> {
  return select<BoardAttachment>(
    `SELECT id, board_revision_id, original_name, relative_path, kind, size_bytes
     FROM board_attachments WHERE board_revision_id = ?1 AND deleted_at IS NULL
     ORDER BY created_at DESC`,
    [boardId],
  );
}

/** Copy a local boardview / schematic file into the store and link it to a board revision. */
export async function addBoardAttachment(
  boardId: number,
  sourcePath: string,
  originalName: string,
  kind = "boardview",
): Promise<void> {
  const stored = await invoke<StoredAttachment>("attachment_store", {
    sourcePath,
    subdir: "boards",
  });
  await run(
    `INSERT INTO board_attachments (board_revision_id, original_name, relative_path, kind, sha256, size_bytes)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
    [boardId, originalName, stored.relative_path, kind, stored.sha256, stored.size],
  );
}

export async function deleteBoardAttachment(id: number): Promise<void> {
  await softDelete("board_attachments", id);
}

export async function listBoardRevisions(): Promise<BoardRevision[]> {
  return select<BoardRevision>(
    "SELECT * FROM board_revisions WHERE deleted_at IS NULL ORDER BY device_model, revision",
  );
}

export async function getBoardRevision(id: number): Promise<BoardRevision | null> {
  return getOne<BoardRevision>("SELECT * FROM board_revisions WHERE id = ?1 AND deleted_at IS NULL", [
    id,
  ]);
}

export async function createBoardRevision(input: {
  device_model: string;
  revision: string;
  layer_count: number | null;
  primary_soc: string | null;
  pmic: string | null;
  notes: string | null;
}): Promise<number> {
  const r = await run(
    `INSERT INTO board_revisions (device_model, revision, layer_count, primary_soc, pmic, notes)
     VALUES (?1,?2,?3,?4,?5,?6)`,
    [input.device_model, input.revision, input.layer_count, input.primary_soc, input.pmic, input.notes],
  );
  return r.lastInsertId;
}

export async function deleteBoardRevision(id: number): Promise<void> {
  await softDelete("board_revisions", id);
}

// --- net / test point / component indices ------------------------------------

export interface BoardNet {
  id: number;
  board_revision_id: number;
  net_name: string;
  test_point: string | null;
  expected_value: string | null;
  units: string | null;
  notes: string | null;
}

export async function listNets(boardId: number): Promise<BoardNet[]> {
  return select<BoardNet>(
    "SELECT id, board_revision_id, net_name, test_point, expected_value, units, notes FROM board_nets WHERE board_revision_id = ?1 AND deleted_at IS NULL ORDER BY net_name",
    [boardId],
  );
}

export async function addNet(
  boardId: number,
  net_name: string,
  test_point: string | null,
  expected_value: string | null,
  units: string | null,
): Promise<void> {
  await run(
    "INSERT INTO board_nets (board_revision_id, net_name, test_point, expected_value, units) VALUES (?1,?2,?3,?4,?5)",
    [boardId, net_name, test_point, expected_value, units],
  );
}

export interface BoardTestPoint {
  id: number;
  board_revision_id: number;
  label: string;
  location_desc: string | null;
  expected_voltage: string | null;
  expected_resistance: string | null;
}

export async function listTestPoints(boardId: number): Promise<BoardTestPoint[]> {
  return select<BoardTestPoint>(
    "SELECT id, board_revision_id, label, location_desc, expected_voltage, expected_resistance FROM board_test_points WHERE board_revision_id = ?1 AND deleted_at IS NULL ORDER BY label",
    [boardId],
  );
}

export async function addTestPoint(
  boardId: number,
  label: string,
  location: string | null,
  voltage: string | null,
  resistance: string | null,
): Promise<void> {
  await run(
    "INSERT INTO board_test_points (board_revision_id, label, location_desc, expected_voltage, expected_resistance) VALUES (?1,?2,?3,?4,?5)",
    [boardId, label, location, voltage, resistance],
  );
}

export interface BoardComponent {
  id: number;
  board_revision_id: number;
  reference_designator: string;
  component_type: string | null;
  value: string | null;
  part_number: string | null;
}

export async function listComponents(boardId: number): Promise<BoardComponent[]> {
  return select<BoardComponent>(
    "SELECT id, board_revision_id, reference_designator, component_type, value, part_number FROM board_components WHERE board_revision_id = ?1 AND deleted_at IS NULL ORDER BY reference_designator",
    [boardId],
  );
}

export async function addComponent(
  boardId: number,
  ref: string,
  type: string | null,
  value: string | null,
  partNumber: string | null,
): Promise<void> {
  await run(
    "INSERT INTO board_components (board_revision_id, reference_designator, component_type, value, part_number) VALUES (?1,?2,?3,?4,?5)",
    [boardId, ref, type, value, partNumber],
  );
}
