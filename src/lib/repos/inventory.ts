import { getOne, run, select, softDelete, tx } from "@/lib/db";
import { logActivity } from "@/lib/repos/activity";
import type {
  InventoryItem,
  InventoryLocation,
  InventorySupplier,
  InventoryAuditEntry,
} from "@/types";
import type { InventoryItemInput } from "@/lib/validators";

export interface InventoryItemRow extends InventoryItem {
  location_name: string | null;
}

export async function listItems(): Promise<InventoryItemRow[]> {
  return select<InventoryItemRow>(
    `SELECT i.*, l.name AS location_name
     FROM inventory_items i LEFT JOIN inventory_locations l ON l.id = i.location_id
     WHERE i.deleted_at IS NULL ORDER BY i.description COLLATE NOCASE`,
  );
}

export async function getItem(id: number): Promise<InventoryItem | null> {
  return getOne<InventoryItem>("SELECT * FROM inventory_items WHERE id = ?1 AND deleted_at IS NULL", [
    id,
  ]);
}

function emptyToNull(v: string): string | null {
  return v.trim() === "" ? null : v;
}

export async function createItem(input: InventoryItemInput): Promise<number> {
  const result = await run(
    `INSERT INTO inventory_items
      (sku, description, category, subcategory, package_type, value, package_size, location_id,
       quantity, low_stock_threshold, unit_cost_cents, sale_price_cents, is_consumable, consumable_unit, notes,
       model_number, serial_number)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17)`,
    [
      emptyToNull(input.sku),
      input.description,
      input.category,
      emptyToNull(input.subcategory),
      emptyToNull(input.package_type),
      emptyToNull(input.value),
      emptyToNull(input.package_size),
      input.location_id,
      input.quantity,
      input.low_stock_threshold,
      input.unit_cost_cents,
      input.sale_price_cents,
      input.is_consumable ? 1 : 0,
      emptyToNull(input.consumable_unit),
      emptyToNull(input.notes),
      emptyToNull(input.model_number),
      emptyToNull(input.serial_number),
    ],
  );
  const id = result.lastInsertId;
  // Ensure every item has a scannable SKU; auto-generate one when left blank.
  if (!input.sku || input.sku.trim() === "") {
    await run("UPDATE inventory_items SET sku = ?1 WHERE id = ?2", [`UR${String(id).padStart(6, "0")}`, id]);
  }
  await logActivity("inventory", id, "created", `Added part ${input.description}`);
  return id;
}

/** Look up an item by its SKU / barcode (used by the USB scanner). */
export async function findItemBySku(sku: string): Promise<InventoryItemRow | null> {
  return getOne<InventoryItemRow>(
    `SELECT i.*, l.name AS location_name
     FROM inventory_items i LEFT JOIN inventory_locations l ON l.id = i.location_id
     WHERE i.sku = ?1 AND i.deleted_at IS NULL`,
    [sku],
  );
}

export async function updateItem(id: number, input: InventoryItemInput): Promise<void> {
  await run(
    `UPDATE inventory_items SET sku=?1, description=?2, category=?3, subcategory=?4, package_type=?5,
       value=?6, package_size=?7, location_id=?8, low_stock_threshold=?9, unit_cost_cents=?10,
       sale_price_cents=?11, is_consumable=?12, consumable_unit=?13, notes=?14, model_number=?15,
       serial_number=?16 WHERE id=?17`,
    [
      emptyToNull(input.sku),
      input.description,
      input.category,
      emptyToNull(input.subcategory),
      emptyToNull(input.package_type),
      emptyToNull(input.value),
      emptyToNull(input.package_size),
      input.location_id,
      input.low_stock_threshold,
      input.unit_cost_cents,
      input.sale_price_cents,
      input.is_consumable ? 1 : 0,
      emptyToNull(input.consumable_unit),
      emptyToNull(input.notes),
      emptyToNull(input.model_number),
      emptyToNull(input.serial_number),
      id,
    ],
  );
  await logActivity("inventory", id, "updated", `Edited part ${input.description}`);
}

export async function deleteItem(id: number): Promise<void> {
  await softDelete("inventory_items", id);
}

/**
 * Apply a stock movement atomically: update quantity and append an audit row in
 * one transaction. `action` is one of receive | adjust | transfer | consume | writeoff.
 */
export async function adjustStock(opts: {
  itemId: number;
  delta: number;
  action: string;
  reason: string | null;
  unitCostCents: number | null;
  technicianId: number | null;
  ticketId: number | null;
}): Promise<void> {
  const item = await getItem(opts.itemId);
  if (!item) throw new Error("Item not found");
  const qtyAfter = item.quantity + opts.delta;
  if (qtyAfter < 0) throw new Error("Insufficient stock for this movement");

  await tx([
    {
      sql: "UPDATE inventory_items SET quantity = ?1 WHERE id = ?2",
      params: [qtyAfter, opts.itemId],
    },
    {
      sql: `INSERT INTO inventory_audit_log
              (item_id, technician_id, action, qty_delta, qty_after, unit_cost_cents, reason, ticket_id)
            VALUES (?1,?2,?3,?4,?5,?6,?7,?8)`,
      params: [
        opts.itemId,
        opts.technicianId,
        opts.action,
        opts.delta,
        qtyAfter,
        opts.unitCostCents,
        opts.reason,
        opts.ticketId,
      ],
    },
  ]);
  await logActivity(
    "inventory",
    opts.itemId,
    opts.action,
    `${opts.action} ${opts.delta >= 0 ? "+" : ""}${opts.delta} (${item.description})`,
  );
}

export async function listAudit(itemId: number): Promise<InventoryAuditEntry[]> {
  return select<InventoryAuditEntry>(
    "SELECT * FROM inventory_audit_log WHERE item_id = ?1 AND deleted_at IS NULL ORDER BY created_at DESC",
    [itemId],
  );
}

export async function lowStockItems(): Promise<InventoryItemRow[]> {
  return select<InventoryItemRow>(
    `SELECT i.*, l.name AS location_name
     FROM inventory_items i LEFT JOIN inventory_locations l ON l.id = i.location_id
     WHERE i.deleted_at IS NULL AND i.low_stock_threshold > 0 AND i.quantity <= i.low_stock_threshold
     ORDER BY i.quantity ASC`,
  );
}

export async function inventoryValueCents(): Promise<number> {
  const row = await getOne<{ total: number }>(
    "SELECT COALESCE(SUM(quantity * unit_cost_cents), 0) AS total FROM inventory_items WHERE deleted_at IS NULL",
  );
  return row?.total ?? 0;
}

// What every part in stock would bring in if it all sold at the listed sale price.
export async function inventorySaleTotalCents(): Promise<number> {
  const row = await getOne<{ total: number }>(
    "SELECT COALESCE(SUM(quantity * sale_price_cents), 0) AS total FROM inventory_items WHERE deleted_at IS NULL",
  );
  return row?.total ?? 0;
}

// --- locations & suppliers ---------------------------------------------------

export async function listLocations(): Promise<InventoryLocation[]> {
  return select<InventoryLocation>(
    "SELECT * FROM inventory_locations WHERE deleted_at IS NULL ORDER BY name",
  );
}

export async function createLocation(name: string, kind: string): Promise<number> {
  const r = await run("INSERT INTO inventory_locations (name, kind) VALUES (?1, ?2)", [name, kind]);
  return r.lastInsertId;
}

export async function deleteLocation(id: number): Promise<void> {
  await softDelete("inventory_locations", id);
}

export async function listSuppliers(): Promise<InventorySupplier[]> {
  return select<InventorySupplier>(
    "SELECT * FROM inventory_suppliers WHERE deleted_at IS NULL ORDER BY name",
  );
}

export async function createSupplier(name: string, website: string | null): Promise<number> {
  const r = await run("INSERT INTO inventory_suppliers (name, website) VALUES (?1, ?2)", [
    name,
    website,
  ]);
  return r.lastInsertId;
}

export async function deleteSupplier(id: number): Promise<void> {
  await softDelete("inventory_suppliers", id);
}
