import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Library, Search, Copy } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { EmptyState } from "@/components/shared/EmptyState";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/sonner";
import { useAsync } from "@/hooks/useAsync";
import { searchReference, referenceCategories, referenceTotal, skuFor } from "@/lib/repos/reference";
import { cn } from "@/lib/utils";
import type { ReferencePart } from "@/types";

export default function ReferencePage() {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("all");
  const [selected, setSelected] = useState<ReferencePart | null>(null);

  const { data: facets } = useAsync(
    async () => ({ cats: await referenceCategories(), total: await referenceTotal() }),
    [],
  );
  const { data, loading } = useAsync(() => searchReference({ q, category }), [q, category]);

  const columns = useMemo<ColumnDef<ReferencePart, unknown>[]>(
    () => [
      { id: "sku", header: "SKU", cell: (c) => <span className="font-mono text-xs text-muted-foreground">{skuFor(c.row.original)}</span> },
      { accessorKey: "name", header: "Part / Component", cell: (c) => <span className="font-medium">{c.row.original.name}</span> },
      { accessorKey: "part_type", header: "Type", cell: (c) => <Badge variant="secondary">{c.row.original.part_type}</Badge> },
      { accessorKey: "brand", header: "Brand", cell: (c) => c.row.original.brand ?? "-" },
      { accessorKey: "device_models", header: "Fits", cell: (c) => <span className="text-muted-foreground">{c.row.original.device_models ?? "-"}</span> },
      { accessorKey: "manufacturer_pn", header: "Mfr Part #", cell: (c) => <span className="font-mono text-xs">{c.row.original.manufacturer_pn ?? c.row.original.designator ?? "-"}</span> },
      { accessorKey: "category", header: "Category", cell: (c) => c.row.original.category },
    ],
    [],
  );

  return (
    <div className="flex h-full flex-col gap-4">
      <PageHeader
        title="Parts Reference"
        description={`Searchable catalog of ${facets?.total ?? 0} parts and components across mobile, laptop, desktop, console, and TV repair.`}
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search parts, ICs, part numbers, devices..." className="pl-8" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <CatChip label="All" active={category === "all"} onClick={() => setCategory("all")} />
          {(facets?.cats ?? []).map((c) => (
            <CatChip key={c.category} label={`${c.category} (${c.n})`} active={category === c.category} onClick={() => setCategory(c.category)} />
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {loading ? (
          <Skeleton className="h-full w-full" />
        ) : (
          <DataTable
            columns={columns}
            data={data ?? []}
            onRowClick={(row) => setSelected(row)}
            empty={<EmptyState icon={Library} title="No matches" description="Try a different search term or category." />}
          />
        )}
      </div>
      {(data?.length ?? 0) >= 500 && (
        <p className="text-xs text-muted-foreground">Showing the first 500 matches. Refine your search to narrow results.</p>
      )}
      {selected && <ReferenceDetailDialog part={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function ReferenceDetailDialog({ part, onClose }: { part: ReferencePart; onClose: () => void }) {
  const sku = skuFor(part);
  function copy(text: string) {
    void navigator.clipboard.writeText(text);
    toast.success("Copied");
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{part.name}</DialogTitle>
          <DialogDescription>{part.part_type} - {part.category}</DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-3 gap-3 text-sm">
          <Field label="SKU" value={sku} mono onCopy={() => copy(sku)} />
          <Field label="Mfr Part #" value={part.manufacturer_pn ?? "-"} mono onCopy={part.manufacturer_pn ? () => copy(part.manufacturer_pn as string) : undefined} />
          <Field label="Designator" value={part.designator ?? "-"} mono />
          <Field label="Brand" value={part.brand ?? "-"} />
          <Field label="Family" value={part.device_family ?? "-"} />
          <Field label="Package" value={part.package ?? "-"} />
          <div className="col-span-3">
            <dt className="text-xs text-muted-foreground">Fits</dt>
            <dd className="text-sm">{part.device_models ?? "-"}</dd>
          </div>
          {part.description && (
            <div className="col-span-3">
              <dt className="text-xs text-muted-foreground">Description</dt>
              <dd className="text-sm">{part.description}</dd>
            </div>
          )}
        </dl>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value, mono, onCopy }: { label: string; value: string; mono?: boolean; onCopy?: () => void }) {
  return (
    <div>
      <dt className="flex items-center gap-1 text-xs text-muted-foreground">
        {label}
        {onCopy && (
          <button type="button" onClick={onCopy} className="text-muted-foreground hover:text-foreground cursor-pointer">
            <Copy className="h-3 w-3" />
          </button>
        )}
      </dt>
      <dd className={mono ? "font-mono text-sm" : "text-sm"}>{value}</dd>
    </div>
  );
}

function CatChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors cursor-pointer",
        active ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground hover:bg-secondary",
      )}
    >
      {label}
    </button>
  );
}
