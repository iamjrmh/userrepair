import { getOne, select, tx } from "@/lib/db";
import { getSetting } from "@/lib/repos/settings";
import { logActivity } from "@/lib/repos/activity";
import type { RewardsLedgerEntry } from "@/types";

export interface RewardsConfig {
  enabled: boolean;
  earnPerDollar: number;
  redeemCentsPerPoint: number;
}

export async function getRewardsConfig(): Promise<RewardsConfig> {
  const [enabled, earnPerDollar, redeemCentsPerPoint] = await Promise.all([
    getSetting<boolean>("rewards.enabled", false),
    getSetting<number>("rewards.earn_per_dollar", 1),
    getSetting<number>("rewards.redeem_cents_per_point", 1),
  ]);
  return { enabled, earnPerDollar, redeemCentsPerPoint };
}

export async function customerPoints(customerId: number): Promise<number> {
  const row = await getOne<{ points_balance: number }>(
    "SELECT points_balance FROM customers WHERE id = ?1 AND deleted_at IS NULL",
    [customerId],
  );
  return row?.points_balance ?? 0;
}

/** Discount value (cents) of a number of points at the configured rate. */
export function pointsValueCents(points: number, redeemCentsPerPoint: number): number {
  return points * redeemCentsPerPoint;
}

/** How many points are needed to cover a value (cents), at the configured rate. */
export function pointsForValue(cents: number, redeemCentsPerPoint: number): number {
  if (redeemCentsPerPoint <= 0) return 0;
  return Math.ceil(cents / redeemCentsPerPoint);
}

async function applyDelta(
  customerId: number,
  saleId: number | null,
  delta: number,
  reason: string,
): Promise<number> {
  const balance = await customerPoints(customerId);
  const after = Math.max(0, balance + delta);
  await tx([
    { sql: "UPDATE customers SET points_balance = ?1 WHERE id = ?2", params: [after, customerId] },
    {
      sql: "INSERT INTO rewards_ledger (customer_id, sale_id, delta_points, balance_after, reason) VALUES (?1,?2,?3,?4,?5)",
      params: [customerId, saleId, delta, after, reason],
    },
  ]);
  return after;
}

export async function earnPoints(
  customerId: number,
  saleId: number | null,
  points: number,
  reason: string,
): Promise<void> {
  if (points <= 0) return;
  await applyDelta(customerId, saleId, points, reason);
}

export async function redeemPoints(
  customerId: number,
  saleId: number | null,
  points: number,
  reason: string,
): Promise<void> {
  if (points <= 0) return;
  await applyDelta(customerId, saleId, -points, reason);
}

/** Manual adjustment (owner/manager): add or remove points with a reason. */
export async function adjustPoints(customerId: number, delta: number, reason: string): Promise<void> {
  await applyDelta(customerId, null, delta, reason);
  await logActivity("rewards", customerId, "adjust", `Points ${delta >= 0 ? "+" : ""}${delta}: ${reason}`);
}

/** Reverse the points earned/redeemed for a sale (used when voiding it). */
export async function reverseSaleRewards(saleId: number, saleNumber: string): Promise<void> {
  const entries = await select<{ customer_id: number; delta_points: number }>(
    "SELECT customer_id, delta_points FROM rewards_ledger WHERE sale_id = ?1 AND deleted_at IS NULL AND (reason IS NULL OR reason NOT LIKE 'Void reversal%')",
    [saleId],
  );
  for (const e of entries) {
    await applyDelta(e.customer_id, saleId, -e.delta_points, `Void reversal ${saleNumber}`);
  }
}

export async function listLedger(customerId: number, limit = 50): Promise<RewardsLedgerEntry[]> {
  return select<RewardsLedgerEntry>(
    "SELECT * FROM rewards_ledger WHERE customer_id = ?1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT ?2",
    [customerId, limit],
  );
}
