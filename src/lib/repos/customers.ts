import { getOne, run, select, softDelete } from "@/lib/db";
import { logActivity } from "@/lib/repos/activity";
import type { Customer, CustomerTag, CustomerCommunication, Device, Ticket } from "@/types";
import type { CustomerInput } from "@/lib/validators";

export async function listCustomers(): Promise<Customer[]> {
  return select<Customer>(
    "SELECT * FROM customers WHERE deleted_at IS NULL ORDER BY name COLLATE NOCASE",
  );
}

export async function getCustomer(id: number): Promise<Customer | null> {
  return getOne<Customer>("SELECT * FROM customers WHERE id = ?1 AND deleted_at IS NULL", [id]);
}

function emptyToNull(v: string | null | undefined): string | null {
  return v && v.trim() !== "" ? v : null;
}

export async function createCustomer(input: CustomerInput): Promise<number> {
  const result = await run(
    `INSERT INTO customers (name, company, phone, email, address, preferred_contact, notes)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
    [
      input.name,
      emptyToNull(input.company),
      emptyToNull(input.phone),
      emptyToNull(input.email),
      emptyToNull(input.address),
      input.preferred_contact,
      emptyToNull(input.notes),
    ],
  );
  await logActivity("customer", result.lastInsertId, "created", `Created customer ${input.name}`);
  return result.lastInsertId;
}

export async function updateCustomer(id: number, input: CustomerInput): Promise<void> {
  await run(
    `UPDATE customers SET name = ?1, company = ?2, phone = ?3, email = ?4, address = ?5,
       preferred_contact = ?6, notes = ?7 WHERE id = ?8`,
    [
      input.name,
      emptyToNull(input.company),
      emptyToNull(input.phone),
      emptyToNull(input.email),
      emptyToNull(input.address),
      input.preferred_contact,
      emptyToNull(input.notes),
      id,
    ],
  );
  await logActivity("customer", id, "updated", `Updated customer ${input.name}`);
}

export async function deleteCustomer(id: number): Promise<void> {
  await softDelete("customers", id);
  await logActivity("customer", id, "deleted", `Deleted customer #${id}`);
}

/**
 * Fuzzy duplicate detection on create/edit: matches on name, phone, or email.
 * Returns potential duplicates excluding the row being edited.
 */
export async function findDuplicateCustomers(
  input: Pick<CustomerInput, "name" | "phone" | "email">,
  excludeId: number | null = null,
): Promise<Customer[]> {
  const namePattern = `%${input.name.trim().toLowerCase()}%`;
  return select<Customer>(
    `SELECT * FROM customers
     WHERE deleted_at IS NULL AND id != ?4 AND (
       LOWER(name) LIKE ?1
       OR (?2 != '' AND phone = ?2)
       OR (?3 != '' AND LOWER(email) = ?3)
     )
     LIMIT 10`,
    [namePattern, (input.phone ?? "").trim(), (input.email ?? "").trim().toLowerCase(), excludeId ?? -1],
  );
}

// --- tags --------------------------------------------------------------------

export async function listCustomerTags(customerId: number): Promise<CustomerTag[]> {
  return select<CustomerTag>(
    "SELECT * FROM customer_tags WHERE customer_id = ?1 AND deleted_at IS NULL ORDER BY tag",
    [customerId],
  );
}

export async function addCustomerTag(customerId: number, tag: string): Promise<void> {
  await run("INSERT INTO customer_tags (customer_id, tag) VALUES (?1, ?2)", [customerId, tag]);
}

export async function removeCustomerTag(id: number): Promise<void> {
  await softDelete("customer_tags", id);
}

// --- communications ----------------------------------------------------------

export async function listCommunications(customerId: number): Promise<CustomerCommunication[]> {
  return select<CustomerCommunication>(
    "SELECT * FROM customer_communications WHERE customer_id = ?1 AND deleted_at IS NULL ORDER BY created_at DESC",
    [customerId],
  );
}

export async function addCommunication(
  customerId: number,
  channel: string,
  body: string,
  technicianId: number | null,
): Promise<void> {
  await run(
    "INSERT INTO customer_communications (customer_id, channel, body, technician_id) VALUES (?1, ?2, ?3, ?4)",
    [customerId, channel, body, technicianId],
  );
}

// --- related records ---------------------------------------------------------

export async function listCustomerDevices(customerId: number): Promise<Device[]> {
  return select<Device>(
    "SELECT * FROM devices WHERE customer_id = ?1 AND deleted_at IS NULL ORDER BY brand, model",
    [customerId],
  );
}

export async function listCustomerTickets(customerId: number): Promise<Ticket[]> {
  return select<Ticket>(
    "SELECT * FROM tickets WHERE customer_id = ?1 AND deleted_at IS NULL ORDER BY created_at DESC",
    [customerId],
  );
}

/** Lifetime spend from paid invoices, in cents. */
export async function customerLifetimeSpend(customerId: number): Promise<number> {
  const row = await getOne<{ total: number }>(
    `SELECT COALESCE(SUM(paid_cents), 0) AS total FROM invoices
     WHERE customer_id = ?1 AND deleted_at IS NULL`,
    [customerId],
  );
  return row?.total ?? 0;
}
