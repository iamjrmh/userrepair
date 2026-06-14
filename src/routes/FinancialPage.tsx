import { useState } from "react";
import { DollarSign, Plus, TrendingUp, TrendingDown, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { useAsync } from "@/hooks/useAsync";
import {
  listTransactions,
  addTransaction,
  deleteTransaction,
  periodTotals,
  listInvoices,
} from "@/lib/repos/financial";
import { formatCents, formatDate, dollarsToCents } from "@/lib/format";
import { invoiceVariant } from "@/lib/status";
import type { InvoiceStatus } from "@/types";

export default function FinancialPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Financial" description="Revenue, expenses, and invoicing. All amounts in integer cents." />
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
        </TabsList>
        <TabsContent value="overview"><Overview /></TabsContent>
        <TabsContent value="transactions"><Transactions /></TabsContent>
        <TabsContent value="invoices"><Invoices /></TabsContent>
      </Tabs>
    </div>
  );
}

function Overview() {
  const { data } = useAsync(async () => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const yearStart = new Date(now.getFullYear(), 0, 1).toISOString();
    const end = now.toISOString();
    const [month, year] = await Promise.all([periodTotals(monthStart, end), periodTotals(yearStart, end)]);
    return { month, year };
  }, []);

  if (!data) return <div className="text-sm text-muted-foreground">Loading...</div>;
  const monthProfit = data.month.revenue - data.month.expense;
  const yearProfit = data.year.revenue - data.year.expense;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <PnlCard title="This month" revenue={data.month.revenue} expense={data.month.expense} profit={monthProfit} />
      <PnlCard title="This year" revenue={data.year.revenue} expense={data.year.expense} profit={yearProfit} />
    </div>
  );
}

function PnlCard({ title, revenue, expense, profit }: { title: string; revenue: number; expense: number; profit: number }) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="flex items-center justify-between"><span className="flex items-center gap-2 text-muted-foreground"><TrendingUp className="h-4 w-4 text-success" /> Revenue</span><span className="tabular-nums">{formatCents(revenue)}</span></div>
        <div className="flex items-center justify-between"><span className="flex items-center gap-2 text-muted-foreground"><TrendingDown className="h-4 w-4 text-destructive" /> Expenses</span><span className="tabular-nums">{formatCents(expense)}</span></div>
        <div className="flex items-center justify-between border-t border-border pt-2 font-semibold"><span>Net profit</span><span className={`tabular-nums ${profit >= 0 ? "text-success" : "text-destructive"}`}>{formatCents(profit)}</span></div>
      </CardContent>
    </Card>
  );
}

function Transactions() {
  const { data, reload } = useAsync(listTransactions, []);
  const [form, setForm] = useState({ kind: "revenue", category: "", amount: "0.00", notes: "" });
  const [pendingDelete, setPendingDelete] = useState<number | null>(null);

  async function add() {
    const cents = dollarsToCents(form.amount);
    if (cents <= 0) {
      toast.error("Enter an amount");
      return;
    }
    await addTransaction({
      kind: form.kind as "revenue" | "expense",
      category: form.category || null,
      amount_cents: cents,
      occurred_at: new Date().toISOString(),
      notes: form.notes || null,
    });
    setForm({ kind: form.kind, category: "", amount: "0.00", notes: "" });
    toast.success("Transaction added");
    reload();
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-1">
        <CardHeader><CardTitle>New entry</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="revenue">Revenue</SelectItem>
                <SelectItem value="expense">Expense</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Category</Label><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="parts / rent / walk-in" /></div>
          <div className="space-y-1.5"><Label>Amount</Label><Input value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Notes</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          <Button onClick={add}><Plus /> Add entry</Button>
        </CardContent>
      </Card>
      <div className="lg:col-span-2">
        {(data?.length ?? 0) === 0 ? (
          <EmptyState icon={DollarSign} title="No transactions" description="Log walk-in sales and expenses here." />
        ) : (
          <div className="divide-y divide-border rounded-lg border border-border">
            {(data ?? []).map((t) => (
              <div key={t.id} className="flex items-center justify-between px-3 py-2.5 text-sm">
                <div>
                  <Badge variant={t.kind === "revenue" ? "success" : "destructive"}>{t.kind}</Badge>
                  <span className="ml-2">{t.category ?? "-"}</span>
                  {t.notes && <span className="ml-2 text-muted-foreground">{t.notes}</span>}
                </div>
                <div className="flex items-center gap-3">
                  <span className="tabular-nums">{formatCents(t.amount_cents)}</span>
                  <span className="text-xs text-muted-foreground">{formatDate(t.occurred_at)}</span>
                  <button type="button" aria-label="Remove" onClick={() => setPendingDelete(t.id)} className="text-muted-foreground hover:text-destructive cursor-pointer">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(o) => !o && setPendingDelete(null)}
        title="Remove this entry?"
        description="The financial entry will be removed."
        confirmLabel="Remove"
        destructive
        onConfirm={async () => {
          if (pendingDelete !== null) {
            await deleteTransaction(pendingDelete);
            setPendingDelete(null);
            reload();
          }
        }}
      />
    </div>
  );
}

function Invoices() {
  const { data } = useAsync(listInvoices, []);
  if ((data?.length ?? 0) === 0) {
    return <EmptyState icon={DollarSign} title="No invoices" description="Invoices are generated from a ticket's parts and labor." />;
  }
  return (
    <div className="divide-y divide-border rounded-lg border border-border">
      {(data ?? []).map((inv) => (
        <div key={inv.id} className="flex items-center justify-between px-3 py-2.5 text-sm">
          <span className="font-mono text-xs">{inv.invoice_number}</span>
          <div className="flex items-center gap-3">
            <Badge variant={invoiceVariant(inv.status as InvoiceStatus)}>{inv.status}</Badge>
            <span className="tabular-nums">{formatCents(inv.total_cents)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
