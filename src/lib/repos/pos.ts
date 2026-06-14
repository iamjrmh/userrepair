import { invoke } from "@tauri-apps/api/core";
import { getOne, run, select, tx } from "@/lib/db";
import { logActivity } from "@/lib/repos/activity";
import { addTransaction } from "@/lib/repos/financial";
import { adjustStock } from "@/lib/repos/inventory";
import { getRewardsConfig, earnPoints, redeemPoints, reverseSaleRewards } from "@/lib/repos/rewards";
import type { PosSale } from "@/types";

export interface PosCartItem {
  kind: "item" | "labor" | "custom";
  description: string;
  quantity: number;
  unit_price_cents: number;
  item_id: number | null;
}

export interface PosTender {
  method: "cash" | "card" | "terminal" | "rewards";
  amount_cents: number;
  points?: number;
  tendered_cents?: number;
  change_cents?: number;
  square_payment_id?: string;
  card_brand?: string;
  last4?: string;
  receipt_url?: string;
}

export interface PosSaleInput {
  ticket_id: number | null;
  customer_id: number | null;
  items: PosCartItem[];
  discount_cents: number;
  tax_rate_bp: number;
  tenders: PosTender[];
  note: string | null;
}

export interface PosTotals {
  subtotal_cents: number;
  taxable_cents: number;
  tax_cents: number;
  total_cents: number;
}

/** Compute the totals for a cart (integer cents throughout). */
export function computeTotals(
  items: PosCartItem[],
  discountCents: number,
  taxRateBp: number,
): PosTotals {
  const subtotal = items.reduce((sum, i) => sum + Math.round(i.quantity * i.unit_price_cents), 0);
  const taxable = Math.max(0, subtotal - discountCents);
  const tax = Math.round((taxable * taxRateBp) / 10000);
  return { subtotal_cents: subtotal, taxable_cents: taxable, tax_cents: tax, total_cents: taxable + tax };
}

async function nextSaleNumber(): Promise<string> {
  const row = await getOne<{ n: number }>("SELECT COUNT(*) AS n FROM pos_sales");
  return `POS-${String((row?.n ?? 0) + 1).padStart(5, "0")}`;
}

/**
 * Record a completed sale: the sale, its line items, and (when paid) a revenue
 * entry, atomically. Item-linked lines then deduct stock.
 */
export async function createSale(
  input: PosSaleInput,
): Promise<{ id: number; number: string; earnedPoints: number }> {
  const totals = computeTotals(input.items, input.discount_cents, input.tax_rate_bp);
  const saleNumber = await nextSaleNumber();
  const method = input.tenders.length > 1 ? "split" : input.tenders[0]?.method ?? "cash";
  const cardTender = input.tenders.find((t) => t.square_payment_id);

  const ids = await tx([
    {
      sql: `INSERT INTO pos_sales
              (sale_number, ticket_id, customer_id, subtotal_cents, discount_cents, tax_rate_bp,
               tax_cents, total_cents, payment_method, payment_status, square_payment_id, card_brand, last4, receipt_url, note)
            VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,'paid',?10,?11,?12,?13,?14)`,
      params: [
        saleNumber,
        input.ticket_id,
        input.customer_id,
        totals.subtotal_cents,
        input.discount_cents,
        input.tax_rate_bp,
        totals.tax_cents,
        totals.total_cents,
        method,
        cardTender?.square_payment_id ?? null,
        cardTender?.card_brand ?? null,
        cardTender?.last4 ?? null,
        cardTender?.receipt_url ?? null,
        input.note,
      ],
    },
  ]);
  const saleId = ids[0] ?? 0;

  for (const item of input.items) {
    await run(
      `INSERT INTO pos_sale_items (sale_id, item_id, kind, description, quantity, unit_price_cents, line_total_cents)
       VALUES (?1,?2,?3,?4,?5,?6,?7)`,
      [
        saleId,
        item.item_id,
        item.kind,
        item.description,
        item.quantity,
        item.unit_price_cents,
        Math.round(item.quantity * item.unit_price_cents),
      ],
    );
  }

  for (const t of input.tenders) {
    await run(
      `INSERT INTO pos_payments (sale_id, method, amount_cents, tendered_cents, change_cents, square_payment_id, card_brand, last4, receipt_url)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)`,
      [
        saleId,
        t.method,
        t.amount_cents,
        t.tendered_cents ?? null,
        t.change_cents ?? null,
        t.square_payment_id ?? null,
        t.card_brand ?? null,
        t.last4 ?? null,
        t.receipt_url ?? null,
      ],
    );
  }

  // Redeemed points are a discount funded by the shop, so revenue is the money
  // actually collected (total minus the rewards portion).
  const rewardsRedeemedCents = input.tenders
    .filter((t) => t.method === "rewards")
    .reduce((s, t) => s + t.amount_cents, 0);

  await addTransaction({
    kind: "revenue",
    category: "POS",
    amount_cents: totals.total_cents - rewardsRedeemedCents,
    occurred_at: new Date().toISOString(),
    notes: `Sale ${saleNumber} (${method})`,
  });

  // Deduct stock for inventory-linked lines.
  for (const item of input.items) {
    if (item.item_id) {
      try {
        await adjustStock({
          itemId: item.item_id,
          delta: -Math.abs(item.quantity),
          action: "consume",
          reason: `POS sale ${saleNumber}`,
          unitCostCents: null,
          technicianId: null,
          ticketId: input.ticket_id,
        });
      } catch {
        // Out-of-stock should not void a completed payment; the sale stands.
      }
    }
  }

  // Rewards: redeem any points used, then earn on the money actually spent.
  let earnedPoints = 0;
  if (input.customer_id) {
    for (const t of input.tenders) {
      if (t.method === "rewards" && t.points && t.points > 0) {
        await redeemPoints(input.customer_id, saleId, t.points, `Redeemed on ${saleNumber}`);
      }
    }
    const rc = await getRewardsConfig();
    if (rc.enabled) {
      const earnBase = Math.max(0, totals.total_cents - rewardsRedeemedCents);
      earnedPoints = Math.floor((earnBase / 100) * rc.earnPerDollar);
      if (earnedPoints > 0) {
        await earnPoints(input.customer_id, saleId, earnedPoints, `Earned on ${saleNumber}`);
      }
    }
  }

  await logActivity("pos", saleId, "sale", `${saleNumber}: ${totals.total_cents}c (${method})`);
  return { id: saleId, number: saleNumber, earnedPoints };
}

export async function listSales(limit = 50): Promise<PosSale[]> {
  return select<PosSale>(
    "SELECT * FROM pos_sales WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT ?1",
    [limit],
  );
}

export async function getSale(id: number): Promise<PosSale | null> {
  return getOne<PosSale>("SELECT * FROM pos_sales WHERE id = ?1 AND deleted_at IS NULL", [id]);
}

export interface PosSaleRow extends PosSale {
  customer_name: string | null;
}

const SALE_SELECT = `SELECT s.*, c.name AS customer_name FROM pos_sales s LEFT JOIN customers c ON c.id = s.customer_id`;

/** Recall the most recent sales (with customer name). */
export async function recentSalesFull(limit = 50): Promise<PosSaleRow[]> {
  return select<PosSaleRow>(
    `${SALE_SELECT} WHERE s.deleted_at IS NULL ORDER BY s.created_at DESC LIMIT ?1`,
    [limit],
  );
}

/** Recall all sales for a customer. */
export async function salesByCustomer(customerId: number): Promise<PosSaleRow[]> {
  return select<PosSaleRow>(
    `${SALE_SELECT} WHERE s.customer_id = ?1 AND s.deleted_at IS NULL ORDER BY s.created_at DESC`,
    [customerId],
  );
}

/** Recall sales that included a line item matching the query (by description). */
export async function salesByItem(query: string): Promise<PosSaleRow[]> {
  const like = `%${query.trim().toLowerCase()}%`;
  return select<PosSaleRow>(
    `SELECT DISTINCT s.*, c.name AS customer_name
     FROM pos_sales s
     JOIN pos_sale_items i ON i.sale_id = s.id
     LEFT JOIN customers c ON c.id = s.customer_id
     WHERE s.deleted_at IS NULL AND LOWER(i.description) LIKE ?1
     ORDER BY s.created_at DESC LIMIT 100`,
    [like],
  );
}

export interface PosSaleItem {
  id: number;
  item_id: number | null;
  kind: string;
  description: string;
  quantity: number;
  unit_price_cents: number;
  line_total_cents: number;
}

export interface PosPaymentRow {
  id: number;
  method: string;
  amount_cents: number;
  tendered_cents: number | null;
  change_cents: number | null;
  square_payment_id: string | null;
  card_brand: string | null;
  last4: string | null;
  receipt_url: string | null;
}

export async function listSaleItems(saleId: number): Promise<PosSaleItem[]> {
  return select<PosSaleItem>(
    "SELECT id, item_id, kind, description, quantity, unit_price_cents, line_total_cents FROM pos_sale_items WHERE sale_id = ?1 AND deleted_at IS NULL ORDER BY id",
    [saleId],
  );
}

export async function listPayments(saleId: number): Promise<PosPaymentRow[]> {
  return select<PosPaymentRow>(
    "SELECT id, method, amount_cents, tendered_cents, change_cents, square_payment_id, card_brand, last4, receipt_url FROM pos_payments WHERE sale_id = ?1 AND deleted_at IS NULL ORDER BY id",
    [saleId],
  );
}

/**
 * Void a sale: refund every card/terminal tender via Square, restore stock for
 * inventory-linked lines, reverse the revenue, and mark the sale refunded.
 * Refunds run first so nothing else changes if a refund fails.
 */
export async function voidSale(saleId: number, authorizedBy?: string): Promise<void> {
  const sale = await getSale(saleId);
  if (!sale) throw new Error("Sale not found");
  if (sale.payment_status === "refunded") throw new Error("Sale is already refunded");

  const payments = await listPayments(saleId);
  const items = await listSaleItems(saleId);

  for (const p of payments) {
    if (p.square_payment_id && (p.method === "card" || p.method === "terminal")) {
      await invoke("square_refund_payment", {
        paymentId: p.square_payment_id,
        amountCents: p.amount_cents,
        reason: `Void ${sale.sale_number}`,
      });
    }
  }

  for (const it of items) {
    if (it.item_id) {
      try {
        await adjustStock({
          itemId: it.item_id,
          delta: Math.abs(it.quantity),
          action: "return",
          reason: `Void ${sale.sale_number}`,
          unitCostCents: null,
          technicianId: null,
          ticketId: sale.ticket_id,
        });
      } catch {
        // A missing item should not block the void.
      }
    }
  }

  const rewardsCents = payments
    .filter((p) => p.method === "rewards")
    .reduce((s, p) => s + p.amount_cents, 0);
  await addTransaction({
    kind: "revenue",
    category: "POS Refund",
    amount_cents: -(sale.total_cents - rewardsCents),
    occurred_at: new Date().toISOString(),
    notes: `Void ${sale.sale_number}`,
  });
  await reverseSaleRewards(saleId, sale.sale_number);
  await run("UPDATE pos_sales SET payment_status = 'refunded' WHERE id = ?1", [saleId]);
  await logActivity(
    "pos",
    saleId,
    "void",
    `Voided ${sale.sale_number} (${sale.total_cents}c)${authorizedBy ? ` - authorized by ${authorizedBy}` : ""}`,
  );
}

// --- ring out an open ticket -------------------------------------------------

export interface OpenTicketHit {
  id: number;
  ticket_number: string;
  title: string;
  customer_name: string | null;
  phone: string | null;
}

/** Find open tickets by customer name, phone, or ticket number (for ring-out). */
export async function searchOpenTickets(query: string): Promise<OpenTicketHit[]> {
  const like = `%${query.trim().toLowerCase()}%`;
  const raw = `%${query.trim()}%`;
  return select<OpenTicketHit>(
    `SELECT t.id, t.ticket_number, t.title, c.name AS customer_name, c.phone
     FROM tickets t LEFT JOIN customers c ON c.id = t.customer_id
     WHERE t.deleted_at IS NULL AND t.status NOT IN ('Completed','Closed','Customer Declined')
       AND (LOWER(c.name) LIKE ?1 OR c.phone LIKE ?2 OR t.ticket_number LIKE ?2)
     ORDER BY t.created_at DESC LIMIT 20`,
    [like, raw],
  );
}

/**
 * Build a POS cart from a ticket's parts and labor. Parts use their inventory
 * sale price; labor uses its hourly line. Part lines drop their item_id so the
 * sale does not double-deduct stock (the tech already consumed them on the ticket).
 */
export async function getTicketCart(
  ticketId: number,
): Promise<{ customerId: number | null; items: PosCartItem[] }> {
  const parts = await select<{
    description: string;
    quantity: number;
    unit_cost_cents: number;
    item_id: number | null;
    sale_price_cents: number | null;
  }>(
    `SELECT tp.description, tp.quantity, tp.unit_cost_cents, tp.item_id, ii.sale_price_cents
     FROM ticket_parts tp LEFT JOIN inventory_items ii ON ii.id = tp.item_id
     WHERE tp.ticket_id = ?1 AND tp.deleted_at IS NULL`,
    [ticketId],
  );
  const labor = await select<{ description: string; quantity: number; unit_price_cents: number }>(
    "SELECT description, quantity, unit_price_cents FROM ticket_estimate_items WHERE ticket_id = ?1 AND kind = 'labor' AND deleted_at IS NULL",
    [ticketId],
  );
  const ticket = await getOne<{ customer_id: number | null }>(
    "SELECT customer_id FROM tickets WHERE id = ?1",
    [ticketId],
  );

  const items: PosCartItem[] = [
    ...parts.map((p) => ({
      kind: "item" as const,
      description: p.description,
      quantity: p.quantity,
      unit_price_cents: p.item_id && p.sale_price_cents ? p.sale_price_cents : p.unit_cost_cents,
      item_id: null,
    })),
    ...labor.map((l) => ({
      kind: "labor" as const,
      description: l.description,
      quantity: l.quantity,
      unit_price_cents: l.unit_price_cents,
      item_id: null,
    })),
  ];
  return { customerId: ticket?.customer_id ?? null, items };
}

export async function salesTodayTotal(): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const row = await getOne<{ total: number }>(
    "SELECT COALESCE(SUM(total_cents),0) AS total FROM pos_sales WHERE deleted_at IS NULL AND substr(created_at,1,10) = ?1 AND payment_status = 'paid'",
    [today],
  );
  return row?.total ?? 0;
}
