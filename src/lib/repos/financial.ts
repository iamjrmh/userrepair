import { getOne, run, select, softDelete } from "@/lib/db";
import { logActivity } from "@/lib/repos/activity";
import type { FinancialTransaction, Invoice, InvoiceLineItem } from "@/types";

export async function listTransactions(): Promise<FinancialTransaction[]> {
  return select<FinancialTransaction>(
    "SELECT * FROM financial_transactions WHERE deleted_at IS NULL ORDER BY occurred_at DESC",
  );
}

export async function addTransaction(input: {
  kind: "revenue" | "expense";
  category: string | null;
  amount_cents: number;
  occurred_at: string;
  notes: string | null;
}): Promise<number> {
  const r = await run(
    `INSERT INTO financial_transactions (kind, category, amount_cents, occurred_at, notes)
     VALUES (?1,?2,?3,?4,?5)`,
    [input.kind, input.category, input.amount_cents, input.occurred_at, input.notes],
  );
  await logActivity("finance", r.lastInsertId, input.kind, `${input.kind}: ${input.amount_cents}c`);
  return r.lastInsertId;
}

export async function deleteTransaction(id: number): Promise<void> {
  await softDelete("financial_transactions", id);
}

/** Revenue and expense totals (cents) for an inclusive ISO date range. */
export async function periodTotals(
  fromIso: string,
  toIso: string,
): Promise<{ revenue: number; expense: number }> {
  const rev = await getOne<{ total: number }>(
    `SELECT COALESCE(SUM(amount_cents),0) AS total FROM financial_transactions
     WHERE deleted_at IS NULL AND kind = 'revenue' AND occurred_at BETWEEN ?1 AND ?2`,
    [fromIso, toIso],
  );
  const exp = await getOne<{ total: number }>(
    `SELECT COALESCE(SUM(amount_cents),0) AS total FROM financial_transactions
     WHERE deleted_at IS NULL AND kind = 'expense' AND occurred_at BETWEEN ?1 AND ?2`,
    [fromIso, toIso],
  );
  return { revenue: rev?.total ?? 0, expense: exp?.total ?? 0 };
}

/** Daily revenue totals over the last N days for the dashboard chart. */
export async function revenueByDay(days: number): Promise<{ day: string; total: number }[]> {
  return select<{ day: string; total: number }>(
    `SELECT substr(occurred_at,1,10) AS day, COALESCE(SUM(amount_cents),0) AS total
     FROM financial_transactions
     WHERE deleted_at IS NULL AND kind = 'revenue'
       AND occurred_at >= date('now', ?1)
     GROUP BY day ORDER BY day`,
    [`-${days} days`],
  );
}

// --- invoices ----------------------------------------------------------------

export async function listInvoices(): Promise<Invoice[]> {
  return select<Invoice>("SELECT * FROM invoices WHERE deleted_at IS NULL ORDER BY created_at DESC");
}

export async function listInvoiceItems(invoiceId: number): Promise<InvoiceLineItem[]> {
  return select<InvoiceLineItem>(
    "SELECT * FROM invoice_line_items WHERE invoice_id = ?1 AND deleted_at IS NULL ORDER BY id",
    [invoiceId],
  );
}

async function nextInvoiceNumber(): Promise<string> {
  const row = await getOne<{ n: number }>("SELECT COUNT(*) AS n FROM invoices");
  return `INV-${String((row?.n ?? 0) + 1).padStart(5, "0")}`;
}

/** Create a draft invoice with line items, computing tax and total in cents. */
export async function createInvoice(input: {
  ticket_id: number | null;
  customer_id: number | null;
  tax_rate_bp: number;
  discount_cents: number;
  items: { kind: "labor" | "part" | "fee"; description: string; quantity: number; unit_price_cents: number }[];
}): Promise<number> {
  const subtotal = input.items.reduce((sum, i) => sum + i.quantity * i.unit_price_cents, 0);
  const taxable = Math.max(0, subtotal - input.discount_cents);
  const tax = Math.round((taxable * input.tax_rate_bp) / 10000);
  const total = taxable + tax;
  const number = await nextInvoiceNumber();

  const r = await run(
    `INSERT INTO invoices
      (invoice_number, ticket_id, customer_id, status, subtotal_cents, discount_cents, tax_rate_bp, tax_cents, total_cents, issued_at)
     VALUES (?1,?2,?3,'Draft',?4,?5,?6,?7,?8,?9)`,
    [
      number,
      input.ticket_id,
      input.customer_id,
      subtotal,
      input.discount_cents,
      input.tax_rate_bp,
      tax,
      total,
      new Date().toISOString(),
    ],
  );
  for (const item of input.items) {
    await run(
      `INSERT INTO invoice_line_items (invoice_id, kind, description, quantity, unit_price_cents, line_total_cents)
       VALUES (?1,?2,?3,?4,?5,?6)`,
      [r.lastInsertId, item.kind, item.description, item.quantity, item.unit_price_cents, item.quantity * item.unit_price_cents],
    );
  }
  await logActivity("invoice", r.lastInsertId, "created", `Created ${number}`);
  return r.lastInsertId;
}

export async function setInvoiceStatus(
  id: number,
  status: string,
  paidCents: number,
): Promise<void> {
  await run("UPDATE invoices SET status = ?1, paid_cents = ?2 WHERE id = ?3", [status, paidCents, id]);
}
