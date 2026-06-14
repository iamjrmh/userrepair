import { useEffect, useState } from "react";
import { ReceiptText, Search } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { SaleDetailDialog } from "@/components/pos/SaleDetailDialog";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Combobox } from "@/components/ui/combobox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useAsync } from "@/hooks/useAsync";
import { listCustomers } from "@/lib/repos/customers";
import { recentSalesFull, salesByCustomer, salesByItem, type PosSaleRow } from "@/lib/repos/pos";
import { formatCents, formatDateTime } from "@/lib/format";

export default function SalesHistoryPage() {
  const [selected, setSelected] = useState<PosSaleRow | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const refresh = () => setReloadKey((k) => k + 1);

  return (
    <div className="flex h-full flex-col gap-4">
      <PageHeader title="Sales History" description="Recall previous sales by customer or by item." />
      <Tabs defaultValue="recent" className="flex min-h-0 flex-1 flex-col">
        <TabsList className="w-fit">
          <TabsTrigger value="recent">Recent</TabsTrigger>
          <TabsTrigger value="customer">By customer</TabsTrigger>
          <TabsTrigger value="item">By item</TabsTrigger>
        </TabsList>
        <TabsContent value="recent" className="min-h-0 flex-1">
          <RecentSales reloadKey={reloadKey} onOpen={setSelected} />
        </TabsContent>
        <TabsContent value="customer" className="min-h-0 flex-1">
          <ByCustomer reloadKey={reloadKey} onOpen={setSelected} />
        </TabsContent>
        <TabsContent value="item" className="min-h-0 flex-1">
          <ByItem reloadKey={reloadKey} onOpen={setSelected} />
        </TabsContent>
      </Tabs>
      {selected && (
        <SaleDetailDialog sale={selected} onClose={() => setSelected(null)} onChanged={refresh} />
      )}
    </div>
  );
}

function RecentSales({ reloadKey, onOpen }: { reloadKey: number; onOpen: (s: PosSaleRow) => void }) {
  const { data } = useAsync(() => recentSalesFull(100), [reloadKey]);
  return <SalesList sales={data ?? []} onOpen={onOpen} empty="No sales recorded yet." />;
}

function ByCustomer({ reloadKey, onOpen }: { reloadKey: number; onOpen: (s: PosSaleRow) => void }) {
  const { data: customers } = useAsync(listCustomers, []);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const { data } = useAsync(
    () => (customerId ? salesByCustomer(Number(customerId)) : Promise.resolve([])),
    [customerId, reloadKey],
  );
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="max-w-sm space-y-1.5">
        <Label>Customer</Label>
        <Combobox
          options={(customers ?? []).map((c) => ({ value: String(c.id), label: c.name, hint: c.phone ?? undefined }))}
          value={customerId}
          onChange={setCustomerId}
          placeholder="Select a customer"
          searchPlaceholder="Search customers..."
        />
      </div>
      <div className="min-h-0 flex-1">
        <SalesList sales={data ?? []} onOpen={onOpen} empty={customerId ? "No sales for this customer." : "Pick a customer to see their sales."} />
      </div>
    </div>
  );
}

function ByItem({ reloadKey, onOpen }: { reloadKey: number; onOpen: (s: PosSaleRow) => void }) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const h = setTimeout(() => setDebounced(query), 200);
    return () => clearTimeout(h);
  }, [query]);
  const { data } = useAsync(
    () => (debounced.trim() ? salesByItem(debounced) : Promise.resolve([])),
    [debounced, reloadKey],
  );
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Item name (e.g. iPhone 13 battery)..." className="pl-8" />
      </div>
      <div className="min-h-0 flex-1">
        <SalesList sales={data ?? []} onOpen={onOpen} empty={debounced.trim() ? "No sales include that item." : "Search for an item to find the sales that included it."} />
      </div>
    </div>
  );
}

function SalesList({ sales, onOpen, empty }: { sales: PosSaleRow[]; onOpen: (s: PosSaleRow) => void; empty: string }) {
  if (sales.length === 0) {
    return <EmptyState icon={ReceiptText} title="No sales" description={empty} />;
  }
  return (
    <Card className="h-full overflow-auto">
      <CardContent className="divide-y divide-border p-0">
        {sales.map((s) => (
          <button key={s.id} type="button" onClick={() => onOpen(s)} className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-secondary/40 cursor-pointer">
            <span className="flex items-center gap-3">
              <span className="font-mono text-xs">{s.sale_number}</span>
              <span>{s.customer_name ?? "Walk-in"}</span>
            </span>
            <span className="flex items-center gap-2">
              {s.payment_status === "refunded" && <Badge variant="destructive">refunded</Badge>}
              <Badge variant="secondary">{s.payment_method}</Badge>
              <span className="tabular-nums">{formatCents(s.total_cents)}</span>
              <span className="hidden text-xs text-muted-foreground sm:inline">{formatDateTime(s.created_at)}</span>
            </span>
          </button>
        ))}
      </CardContent>
    </Card>
  );
}
