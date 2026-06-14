import { getOne, run, select, softDelete } from "@/lib/db";
import { logActivity } from "@/lib/repos/activity";
import type { Device, Ticket } from "@/types";
import type { DeviceInput } from "@/lib/validators";

export interface DeviceWithCustomer extends Device {
  customer_name: string | null;
}

export async function listDevices(): Promise<DeviceWithCustomer[]> {
  return select<DeviceWithCustomer>(
    `SELECT d.*, c.name AS customer_name
     FROM devices d LEFT JOIN customers c ON c.id = d.customer_id
     WHERE d.deleted_at IS NULL ORDER BY d.brand, d.model`,
  );
}

export async function getDevice(id: number): Promise<Device | null> {
  return getOne<Device>("SELECT * FROM devices WHERE id = ?1 AND deleted_at IS NULL", [id]);
}

function emptyToNull(v: string | null | undefined): string | null {
  return v && v.trim() !== "" ? v : null;
}

export async function createDevice(input: DeviceInput): Promise<number> {
  const result = await run(
    `INSERT INTO devices (customer_id, category, brand, model, model_number, variant, serial_number, imei, asset_tag, notes)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`,
    [
      input.customer_id,
      input.category,
      input.brand,
      input.model,
      emptyToNull(input.model_number),
      emptyToNull(input.variant),
      emptyToNull(input.serial_number),
      emptyToNull(input.imei),
      emptyToNull(input.asset_tag),
      emptyToNull(input.notes),
    ],
  );
  await logActivity("device", result.lastInsertId, "created", `Added ${input.brand} ${input.model}`);
  return result.lastInsertId;
}

export async function updateDevice(id: number, input: DeviceInput): Promise<void> {
  await run(
    `UPDATE devices SET customer_id = ?1, category = ?2, brand = ?3, model = ?4, model_number = ?5, variant = ?6,
       serial_number = ?7, imei = ?8, asset_tag = ?9, notes = ?10 WHERE id = ?11`,
    [
      input.customer_id,
      input.category,
      input.brand,
      input.model,
      emptyToNull(input.model_number),
      emptyToNull(input.variant),
      emptyToNull(input.serial_number),
      emptyToNull(input.imei),
      emptyToNull(input.asset_tag),
      emptyToNull(input.notes),
      id,
    ],
  );
}

/** Update just the notes for a device (used by the device detail dialog). */
export async function updateDeviceNotes(id: number, notes: string): Promise<void> {
  await run("UPDATE devices SET notes = ?1 WHERE id = ?2", [emptyToNull(notes), id]);
}

export async function deleteDevice(id: number): Promise<void> {
  await softDelete("devices", id);
  await logActivity("device", id, "deleted", `Removed device #${id}`);
}

/** Repair history across all customers who brought in the same model. */
export async function modelRepairHistory(brand: string, model: string): Promise<Ticket[]> {
  return select<Ticket>(
    `SELECT t.* FROM tickets t
     JOIN devices d ON d.id = t.device_id
     WHERE d.brand = ?1 AND d.model = ?2 AND t.deleted_at IS NULL
     ORDER BY t.created_at DESC`,
    [brand, model],
  );
}
