import { run, select, softDelete } from "@/lib/db";
import type { Technician } from "@/types";

export async function listTechnicians(includeInactive = false): Promise<Technician[]> {
  const where = includeInactive ? "deleted_at IS NULL" : "deleted_at IS NULL AND active = 1";
  return select<Technician>(`SELECT * FROM technicians WHERE ${where} ORDER BY name`);
}

export async function createTechnician(input: {
  name: string;
  email: string | null;
  role: string;
  color: string;
}): Promise<number> {
  const result = await run(
    "INSERT INTO technicians (name, email, role, color) VALUES (?1, ?2, ?3, ?4)",
    [input.name, input.email, input.role, input.color],
  );
  return result.lastInsertId;
}

export async function updateTechnician(
  id: number,
  input: { name: string; email: string | null; role: string; color: string; active: number },
): Promise<void> {
  await run(
    "UPDATE technicians SET name = ?1, email = ?2, role = ?3, color = ?4, active = ?5 WHERE id = ?6",
    [input.name, input.email, input.role, input.color, input.active, id],
  );
}

export async function deactivateTechnician(id: number): Promise<void> {
  await softDelete("technicians", id);
}
