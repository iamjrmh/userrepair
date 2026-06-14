import { run, select, softDelete } from "@/lib/db";
import type { FaultRecord, RepairSolution } from "@/types";

export async function listFaults(): Promise<FaultRecord[]> {
  return select<FaultRecord>(
    "SELECT * FROM fault_records WHERE deleted_at IS NULL ORDER BY created_at DESC",
  );
}

export async function createFault(input: {
  ticket_id: number | null;
  device_model: string | null;
  category: string;
  state: string;
  common_cause: string | null;
  reasoning: string | null;
  component_ref: string | null;
}): Promise<number> {
  const r = await run(
    `INSERT INTO fault_records (ticket_id, device_model, category, state, common_cause, reasoning, component_ref)
     VALUES (?1,?2,?3,?4,?5,?6,?7)`,
    [
      input.ticket_id,
      input.device_model,
      input.category,
      input.state,
      input.common_cause,
      input.reasoning,
      input.component_ref,
    ],
  );
  return r.lastInsertId;
}

export async function deleteFault(id: number): Promise<void> {
  await softDelete("fault_records", id);
}

export async function listSolutions(): Promise<RepairSolution[]> {
  return select<RepairSolution>(
    "SELECT * FROM repair_solutions WHERE deleted_at IS NULL ORDER BY success_count DESC, created_at DESC",
  );
}

export async function createSolution(input: {
  device_model: string | null;
  fault_category: string | null;
  title: string;
  solution: string;
}): Promise<number> {
  const r = await run(
    `INSERT INTO repair_solutions (device_model, fault_category, title, solution) VALUES (?1,?2,?3,?4)`,
    [input.device_model, input.fault_category, input.title, input.solution],
  );
  return r.lastInsertId;
}

export async function recordSolutionOutcome(id: number, success: boolean): Promise<void> {
  const column = success ? "success_count" : "fail_count";
  await run(`UPDATE repair_solutions SET ${column} = ${column} + 1 WHERE id = ?1`, [id]);
}

export async function deleteSolution(id: number): Promise<void> {
  await softDelete("repair_solutions", id);
}

/** Aggregate component failure frequency from fault records. */
export async function componentFailureStats(): Promise<{ component_ref: string; n: number }[]> {
  return select<{ component_ref: string; n: number }>(
    `SELECT component_ref, COUNT(*) AS n FROM fault_records
     WHERE deleted_at IS NULL AND component_ref IS NOT NULL AND component_ref != ''
     GROUP BY component_ref ORDER BY n DESC LIMIT 20`,
  );
}
