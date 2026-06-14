import { run, select, softDelete } from "@/lib/db";
import type { Measurement, MeasurementKind } from "@/types";

export interface MeasurementRow extends Measurement {
  technician_name: string | null;
  board_label: string | null;
}

const SELECT = `
  SELECT m.*, t.name AS technician_name,
         (b.device_model || ' ' || b.revision) AS board_label
  FROM measurements m
  LEFT JOIN technicians t ON t.id = m.technician_id
  LEFT JOIN board_revisions b ON b.id = m.board_revision_id
`;

export async function listMeasurements(filter?: {
  ticketId?: number;
  boardId?: number;
  knownGoodOnly?: boolean;
}): Promise<MeasurementRow[]> {
  const clauses = ["m.deleted_at IS NULL"];
  const params: (number | string)[] = [];
  if (filter?.ticketId !== undefined) {
    params.push(filter.ticketId);
    clauses.push(`m.ticket_id = ?${params.length}`);
  }
  if (filter?.boardId !== undefined) {
    params.push(filter.boardId);
    clauses.push(`m.board_revision_id = ?${params.length}`);
  }
  if (filter?.knownGoodOnly) {
    clauses.push("m.is_known_good = 1");
  }
  return select<MeasurementRow>(
    `${SELECT} WHERE ${clauses.join(" AND ")} ORDER BY m.created_at DESC`,
    params,
  );
}

export interface MeasurementInput {
  ticket_id: number | null;
  board_revision_id: number | null;
  technician_id: number | null;
  kind: MeasurementKind;
  test_point: string | null;
  reference_designator: string | null;
  rail_name: string | null;
  power_state: string | null;
  expected_value: string | null;
  measured_value: string | null;
  units: string | null;
  measurement_mode: string | null;
  orientation: string | null;
  signal_type: string | null;
  frequency: string | null;
  result: string | null;
  notes: string | null;
}

export async function createMeasurement(input: MeasurementInput): Promise<number> {
  const r = await run(
    `INSERT INTO measurements
      (ticket_id, board_revision_id, technician_id, kind, test_point, reference_designator, rail_name,
       power_state, expected_value, measured_value, units, measurement_mode, orientation, signal_type,
       frequency, result, notes)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17)`,
    [
      input.ticket_id,
      input.board_revision_id,
      input.technician_id,
      input.kind,
      input.test_point,
      input.reference_designator,
      input.rail_name,
      input.power_state,
      input.expected_value,
      input.measured_value,
      input.units,
      input.measurement_mode,
      input.orientation,
      input.signal_type,
      input.frequency,
      input.result,
      input.notes,
    ],
  );
  return r.lastInsertId;
}

export async function markKnownGood(id: number, knownGood: boolean): Promise<void> {
  await run("UPDATE measurements SET is_known_good = ?1 WHERE id = ?2", [knownGood ? 1 : 0, id]);
}

export async function deleteMeasurement(id: number): Promise<void> {
  await softDelete("measurements", id);
}
