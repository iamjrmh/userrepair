import { useCallback, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Package, Plus, Search, AlertTriangle, ArrowUpDown, Trash2, ScanLine, Printer } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { EmptyState } from "@/components/shared/EmptyState";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Barcode } from "@/components/shared/Barcode";
import { Combobox } from "@/components/ui/combobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
  listItems,
  getItem,
  createItem,
  adjustStock,
  deleteItem,
  listAudit,
  lowStockItems,
  inventoryValueCents,
  listLocations,
  createLocation,
  findItemBySku,
  type InventoryItemRow,
} from "@/lib/repos/inventory";
import { inventoryItemSchema } from "@/lib/validators";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import { formatCents, dollarsToCents, formatDateTime } from "@/lib/format";
import type { InventoryItem } from "@/types";

const CATEGORIES = [
  "Device (Resale)",
  "Accessory",
  "Screen Assembly",
  "Battery",
  "Charging Port / Connector",
  "IC / Chip",
  "MOSFET / Transistor",
  "Capacitor / Resistor",
  "Flex Cable",
  "Housing / Frame",
  "Tool / Consumable",
  "Other Component",
];

export default function InventoryPage() {
  const { data, loading, reload } = useAsync(
    async () => {
      const [items, low, value] = await Promise.all([
        listItems(),
        lowStockItems(),
        inventoryValueCents(),
      ]);
      return { items, low, value };
    },
    [],
  );
  const [filter, setFilter] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [adjustItem, setAdjustItem] = useState<InventoryItemRow | null>(null);
  const [detailItem, setDetailItem] = useState<InventoryItemRow | null>(null);
  const [labelItemId, setLabelItemId] = useState<number | null>(null);

  const handleScan = useCallback(async (code: string) => {
    const trimmed = code.trim();
    if (trimmed === "") return;
    const item = await findItemBySku(trimmed);
    if (item) setDetailItem(item);
    else toast.error(`No item with code ${trimmed}`);
  }, []);

  useBarcodeScanner((code) => void handleScan(code));

  const columns = useMemo<ColumnDef<InventoryItemRow, unknown>[]>(
    () => [
      { accessorKey: "description", header: "Description", cell: (c) => <span className="font-medium">{c.row.original.description}</span> },
      { accessorKey: "sku", header: "SKU", cell: (c) => <span className="font-mono text-xs">{c.row.original.sku ?? "-"}</span> },
      { accessorKey: "category", header: "Category", cell: (c) => <Badge variant="secondary">{c.row.original.category}</Badge> },
      { accessorKey: "location_name", header: "Location", cell: (c) => c.row.original.location_name ?? "-" },
      {
        accessorKey: "quantity",
        header: "Qty",
        cell: (c) => {
          const r = c.row.original;
          const low = r.low_stock_threshold > 0 && r.quantity <= r.low_stock_threshold;
          return <span className={low ? "font-semibold text-warning tabular-nums" : "tabular-nums"}>{r.quantity}</span>;
        },
      },
      { accessorKey: "unit_cost_cents", header: "Unit cost", cell: (c) => <span className="tabular-nums">{formatCents(c.row.original.unit_cost_cents)}</span> },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: (c) => (
          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setAdjustItem(c.row.original); }}>
            <ArrowUpDown /> Adjust
          </Button>
        ),
      },
    ],
    [],
  );

  return (
    <div className="flex h-full flex-col gap-4">
      <PageHeader
        title="Inventory"
        description="Parts, components, and consumables with full audit history."
        actions={<Button onClick={() => setCreateOpen(true)}><Plus /> New item</Button>}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="Distinct items" value={String(data?.items.length ?? 0)} />
        <StatCard label="Low stock" value={String(data?.low.length ?? 0)} warn={(data?.low.length ?? 0) > 0} />
        <StatCard label="Inventory value" value={formatCents(data?.value ?? 0)} />
      </div>

      <Tabs defaultValue="all" className="flex min-h-0 flex-1 flex-col">
        <TabsList className="w-fit">
          <TabsTrigger value="all">All items</TabsTrigger>
          <TabsTrigger value="low">Low stock</TabsTrigger>
        </TabsList>
        <TabsContent value="all" className="min-h-0 flex-1">
          <div className="mb-3 flex gap-2">
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter parts..." className="pl-8" />
            </div>
            <div className="relative max-w-xs flex-1">
              <ScanLine className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Scan a barcode..."
                className="pl-8"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const el = e.target as HTMLInputElement;
                    void handleScan(el.value);
                    el.value = "";
                  }
                }}
              />
            </div>
          </div>
          {loading ? (
            <Skeleton className="h-96 w-full" />
          ) : (
            <DataTable
              columns={columns}
              data={data?.items ?? []}
              globalFilter={filter}
              onRowClick={(row) => setDetailItem(row)}
              empty={<EmptyState icon={Package} title="No inventory" description="Add parts and consumables to track stock." action={<Button onClick={() => setCreateOpen(true)}><Plus /> New item</Button>} />}
            />
          )}
        </TabsContent>
        <TabsContent value="low" className="min-h-0 flex-1">
          {(data?.low.length ?? 0) === 0 ? (
            <EmptyState icon={AlertTriangle} title="No low stock" description="Everything is above its reorder threshold." />
          ) : (
            <DataTable columns={columns} data={data?.low ?? []} onRowClick={(row) => setDetailItem(row)} />
          )}
        </TabsContent>
      </Tabs>

      <ItemFormDialog open={createOpen} onOpenChange={setCreateOpen} onSaved={(id) => { reload(); setLabelItemId(id); }} categories={CATEGORIES} />
      {labelItemId !== null && <LabelDialog itemId={labelItemId} onClose={() => setLabelItemId(null)} />}
      {adjustItem && (
        <AdjustStockDialog item={adjustItem} onClose={() => setAdjustItem(null)} onSaved={reload} />
      )}
      {detailItem && (
        <ItemDetailDialog
          item={detailItem}
          onClose={() => setDetailItem(null)}
          onChanged={reload}
          onAdjust={() => {
            setAdjustItem(detailItem);
            setDetailItem(null);
          }}
        />
      )}
    </div>
  );
}

function ItemDetailDialog({
  item,
  onClose,
  onChanged,
  onAdjust,
}: {
  item: InventoryItemRow;
  onClose: () => void;
  onChanged: () => void;
  onAdjust: () => void;
}) {
  const { data: audit } = useAsync(() => listAudit(item.id), [item.id]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isDevice = item.category === "Device (Resale)" || item.category === "Accessory";

  async function remove() {
    await deleteItem(item.id);
    toast.success("Item removed");
    onClose();
    onChanged();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{item.description}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <dl className="grid grid-cols-3 gap-3 text-sm">
            <Detail label="SKU" value={item.sku ?? "-"} mono />
            <Detail label="Category" value={item.category} />
            <Detail label="Location" value={item.location_name ?? "-"} />
            <Detail label="On hand" value={String(item.quantity)} />
            <Detail label="Unit cost" value={formatCents(item.unit_cost_cents)} />
            <Detail label="Sale price" value={formatCents(item.sale_price_cents)} />
            {isDevice && <Detail label="Model #" value={item.model_number ?? "-"} mono />}
            {isDevice && <Detail label="Serial" value={item.serial_number ?? "-"} mono />}
          </dl>
          {item.notes && <p className="text-sm text-muted-foreground">{item.notes}</p>}
          <ItemLabel item={item} />
          <div>
            <div className="mb-1 text-xs font-medium text-muted-foreground">Audit history</div>
            <div className="max-h-44 space-y-1 overflow-y-auto">
              {(audit?.length ?? 0) === 0 ? (
                <p className="text-sm text-muted-foreground">No stock movements recorded.</p>
              ) : (
                (audit ?? []).map((a) => (
                  <div key={a.id} className="flex items-center justify-between rounded-md border border-border px-2.5 py-1.5 text-sm">
                    <span><Badge variant="secondary">{a.action}</Badge> <span className="tabular-nums">{a.qty_delta >= 0 ? "+" : ""}{a.qty_delta}</span> -&gt; {a.qty_after}</span>
                    <span className="text-xs text-muted-foreground">{formatDateTime(a.created_at)}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="destructive" onClick={() => setConfirmDelete(true)}><Trash2 /> Remove</Button>
          <Button variant="outline" onClick={() => window.print()}><Printer /> Print label</Button>
          <Button variant="outline" onClick={onAdjust}><ArrowUpDown /> Adjust stock</Button>
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Remove this item?"
        description={`${item.description} will be removed from inventory.`}
        confirmLabel="Remove"
        destructive
        onConfirm={remove}
      />
    </Dialog>
  );
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={mono ? "font-mono text-sm" : "text-sm"}>{value}</dd>
    </div>
  );
}

function StatCard({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${warn ? "text-warning" : ""}`}>{value}</div>
    </div>
  );
}

function ItemFormDialog({
  open,
  onOpenChange,
  onSaved,
  categories,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: (id: number) => void;
  categories: string[];
}) {
  const { data: locations, reload: reloadLocations } = useAsync(listLocations, []);
  const [newLocOpen, setNewLocOpen] = useState(false);
  const [form, setForm] = useState({
    description: "",
    sku: "",
    category: categories[0] ?? "Other Component",
    locationId: "none",
    quantity: "0",
    threshold: "0",
    cost: "0.00",
    price: "0.00",
    modelNumber: "",
    serial: "",
  });

  const isDevice = form.category === "Device (Resale)" || form.category === "Accessory";

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit() {
    const parsed = inventoryItemSchema.safeParse({
      description: form.description,
      sku: form.sku,
      category: form.category,
      location_id: form.locationId === "none" ? null : Number(form.locationId),
      quantity: Number(form.quantity) || 0,
      low_stock_threshold: Number(form.threshold) || 0,
      unit_cost_cents: dollarsToCents(form.cost),
      sale_price_cents: dollarsToCents(form.price),
      is_consumable: false,
      model_number: isDevice ? form.modelNumber : "",
      serial_number: isDevice ? form.serial : "",
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Invalid item");
      return;
    }
    const id = await createItem(parsed.data);
    toast.success("Item added");
    onOpenChange(false);
    onSaved(id);
  }

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New inventory item</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Input value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="iPhone 13 OLED assembly" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>SKU / part number</Label>
              <Input value={form.sku} onChange={(e) => set("sku", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => set("category", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Location</Label>
                <button type="button" onClick={() => setNewLocOpen(true)} className="text-xs text-primary hover:underline cursor-pointer">
                  + New location
                </button>
              </div>
              <Combobox
                options={[{ value: "none", label: "No location" }, ...(locations ?? []).map((l) => ({ value: String(l.id), label: l.name, hint: l.kind }))]}
                value={form.locationId}
                onChange={(v) => set("locationId", v)}
                placeholder="No location"
                searchPlaceholder="Search locations..."
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>Qty</Label>
                <Input type="number" value={form.quantity} onChange={(e) => set("quantity", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Reorder at</Label>
                <Input type="number" value={form.threshold} onChange={(e) => set("threshold", e.target.value)} />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Unit cost</Label>
              <Input value={form.cost} onChange={(e) => set("cost", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Sale price</Label>
              <Input value={form.price} onChange={(e) => set("price", e.target.value)} />
            </div>
          </div>
          {isDevice && (
            <div className="grid grid-cols-2 gap-3 rounded-md border border-border bg-secondary/30 p-3">
              <div className="space-y-1.5">
                <Label>Model number</Label>
                <Input value={form.modelNumber} onChange={(e) => set("modelNumber", e.target.value)} placeholder="A2342 / SM-G991B" />
              </div>
              <div className="space-y-1.5">
                <Label>Serial number</Label>
                <Input value={form.serial} onChange={(e) => set("serial", e.target.value)} placeholder="Device serial" />
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit}>Add item</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <NewLocationDialog
      open={newLocOpen}
      onOpenChange={setNewLocOpen}
      onCreated={(id) => { reloadLocations(); set("locationId", String(id)); }}
    />
    </>
  );
}

function NewLocationDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (id: number) => void;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState("shelf");
  async function create() {
    if (name.trim() === "") {
      toast.error("Enter a location name");
      return;
    }
    const id = await createLocation(name.trim(), kind);
    toast.success("Location added");
    setName("");
    onCreated(id);
    onOpenChange(false);
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>New location</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Shelf A2 / Bin 14" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="shelf">Shelf</SelectItem>
                <SelectItem value="bin">Bin</SelectItem>
                <SelectItem value="drawer">Drawer</SelectItem>
                <SelectItem value="cabinet">Cabinet</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={create}>Add location</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ItemLabel({ item }: { item: { description: string; sku: string | null; sale_price_cents: number } }) {
  return (
    <div className="print-label flex flex-col items-center gap-1 rounded-md border border-border bg-white p-3">
      <div className="text-sm font-semibold text-black">{item.description}</div>
      {item.sku ? <Barcode value={item.sku} /> : <span className="text-xs text-black">No SKU</span>}
      <div className="text-sm font-semibold text-black">{formatCents(item.sale_price_cents)}</div>
    </div>
  );
}

function LabelDialog({ itemId, onClose }: { itemId: number; onClose: () => void }) {
  const { data: item } = useAsync<InventoryItem | null>(() => getItem(itemId), [itemId]);
  if (!item) return null;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Item label</DialogTitle>
        </DialogHeader>
        <ItemLabel item={item} />
        <DialogFooter>
          <Button variant="outline" onClick={() => window.print()}><Printer /> Print label</Button>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AdjustStockDialog({
  item,
  onClose,
  onSaved,
}: {
  item: InventoryItemRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [action, setAction] = useState("receive");
  const [qty, setQty] = useState("1");
  const [reason, setReason] = useState("");

  async function submit() {
    const magnitude = Math.abs(Number(qty) || 0);
    if (magnitude === 0) {
      toast.error("Enter a quantity");
      return;
    }
    const negative = action === "consume" || action === "writeoff";
    try {
      await adjustStock({
        itemId: item.id,
        delta: negative ? -magnitude : magnitude,
        action,
        reason: reason.trim() === "" ? null : reason,
        unitCostCents: item.unit_cost_cents,
        technicianId: null,
        ticketId: null,
      });
      toast.success("Stock updated");
      onClose();
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Adjustment failed");
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Adjust stock - {item.description}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="text-sm text-muted-foreground">Current quantity: <span className="font-semibold text-foreground tabular-nums">{item.quantity}</span></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Action</Label>
              <Select value={action} onValueChange={setAction}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="receive">Receive (+)</SelectItem>
                  <SelectItem value="adjust">Manual adjust (+)</SelectItem>
                  <SelectItem value="consume">Consume (-)</SelectItem>
                  <SelectItem value="writeoff">Write off (-)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Quantity</Label>
              <Input type="number" value={qty} onChange={(e) => setQty(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Reason</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="PO #, damage, etc." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit}>Apply</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
