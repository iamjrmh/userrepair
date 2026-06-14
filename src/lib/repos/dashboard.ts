import { count } from "@/lib/db";
import { openTicketCount, dueTodayCount, statusCounts } from "@/lib/repos/tickets";
import { lowStockItems, inventoryValueCents } from "@/lib/repos/inventory";
import { periodTotals } from "@/lib/repos/financial";

export interface DashboardStats {
  openTickets: number;
  dueToday: number;
  lowStock: number;
  revenueMonthCents: number;
  totalCustomers: number;
  inventoryValueCents: number;
  statusCounts: { status: string; n: number }[];
}

export async function loadDashboardStats(): Promise<DashboardStats> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const monthEnd = now.toISOString();

  const [open, due, low, totals, customers, statuses, invValue] = await Promise.all([
    openTicketCount(),
    dueTodayCount(),
    lowStockItems(),
    periodTotals(monthStart, monthEnd),
    count("SELECT COUNT(*) AS n FROM customers WHERE deleted_at IS NULL"),
    statusCounts(),
    inventoryValueCents(),
  ]);

  return {
    openTickets: open,
    dueToday: due,
    lowStock: low.length,
    revenueMonthCents: totals.revenue,
    totalCustomers: customers,
    inventoryValueCents: invValue,
    statusCounts: statuses,
  };
}
