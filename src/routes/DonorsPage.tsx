import { useState } from "react";
import { CircuitBoard, Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  listDonorBoards,
  createDonorBoard,
  setDepleted,
  listComponents,
  addComponent,
  deleteDonorBoard,
} from "@/lib/repos/donors";
import { formatCents, dollarsToCents } from "@/lib/format";
import type { DonorBoard, DonorCondition } from "@/types";

const CONDITIONS: DonorCondition[] = ["Functional", "Partially Functional", "For Parts Only", "Unknown"];

export default function DonorsPage() {
  const { data, loading, reload } = useAsync(listDonorBoards, []);
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<DonorBoard | null>(null);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Donor Boards"
        description="Harvested-parts inventory tracked by board revision."
        actions={<Button onClick={() => setCreateOpen(true)}><Plus /> New donor</Button>}
      />

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading...</div>
      ) : (data?.length ?? 0) === 0 ? (
        <EmptyState icon={CircuitBoard} title="No donor boards" description="Log a donor board to harvest components from." action={<Button onClick={() => setCreateOpen(true)}><Plus /> New donor</Button>} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {(data ?? []).map((b) => (
            <Card key={b.id} className="cursor-pointer hover:border-ring" onClick={() => setSelected(b)}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-base">
                  <span>{b.brand} {b.model}</span>
                  {b.depleted === 1 && <Badge variant="destructive">Depleted</Badge>}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm text-muted-foreground">
                <div>Rev {b.board_revision ?? "-"}</div>
                <Badge variant="secondary">{b.condition}</Badge>
                <div className="tabular-nums">Paid {formatCents(b.purchase_cents)}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <DonorFormDialog open={createOpen} onOpenChange={setCreateOpen} onSaved={reload} />
      {selected && <DonorComponentsDialog board={selected} onClose={() => setSelected(null)} onChanged={reload} />}
    </div>
  );
}

function DonorFormDialog({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; onSaved: () => void }) {
  const [form, setForm] = useState({ brand: "", model: "", revision: "", condition: "Unknown", source: "", price: "0.00" });
  function set<K extends keyof typeof form>(k: K, v: string) { setForm((f) => ({ ...f, [k]: v })); }

  async function submit() {
    if (form.brand.trim() === "" || form.model.trim() === "") {
      toast.error("Brand and model are required");
      return;
    }
    await createDonorBoard({
      brand: form.brand,
      model: form.model,
      board_revision: form.revision || null,
      condition: form.condition,
      source: form.source || null,
      purchase_cents: dollarsToCents(form.price),
      notes: null,
    });
    toast.success("Donor board added");
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>New donor board</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Brand</Label><Input value={form.brand} onChange={(e) => set("brand", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Model</Label><Input value={form.model} onChange={(e) => set("model", e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Board revision</Label><Input value={form.revision} onChange={(e) => set("revision", e.target.value)} placeholder="820-01700" /></div>
            <div className="space-y-1.5">
              <Label>Condition</Label>
              <Select value={form.condition} onValueChange={(v) => set("condition", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CONDITIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Source</Label><Input value={form.source} onChange={(e) => set("source", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Purchase price</Label><Input value={form.price} onChange={(e) => set("price", e.target.value)} /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit}>Add donor</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DonorComponentsDialog({ board, onClose, onChanged }: { board: DonorBoard; onClose: () => void; onChanged: () => void }) {
  const { data, reload } = useAsync(() => listComponents(board.id), [board.id]);
  const [form, setForm] = useState({ type: "IC", ref: "", value: "", part: "", qty: "1", condition: "untested" });
  const [confirmDelete, setConfirmDelete] = useState(false);
  function set<K extends keyof typeof form>(k: K, v: string) { setForm((f) => ({ ...f, [k]: v })); }

  async function add() {
    if (form.type.trim() === "") return;
    await addComponent({
      donor_board_id: board.id,
      component_type: form.type,
      reference_designator: form.ref || null,
      value: form.value || null,
      part_number: form.part || null,
      quantity: Number(form.qty) || 1,
      condition: form.condition,
    });
    setForm({ type: "IC", ref: "", value: "", part: "", qty: "1", condition: "untested" });
    reload();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{board.brand} {board.model} - harvested components</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-6 gap-2">
            <Input className="col-span-1" value={form.type} onChange={(e) => set("type", e.target.value)} placeholder="Type" />
            <Input className="col-span-1" value={form.ref} onChange={(e) => set("ref", e.target.value)} placeholder="Ref" />
            <Input className="col-span-1" value={form.value} onChange={(e) => set("value", e.target.value)} placeholder="Value" />
            <Input className="col-span-1" value={form.part} onChange={(e) => set("part", e.target.value)} placeholder="Part #" />
            <Input className="col-span-1" type="number" value={form.qty} onChange={(e) => set("qty", e.target.value)} placeholder="Qty" />
            <Button className="col-span-1" onClick={add}><Plus /> Add</Button>
          </div>
          <div className="max-h-80 space-y-1 overflow-y-auto">
            {(data ?? []).map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                <span><span className="font-mono text-xs">{c.reference_designator ?? "-"}</span> {c.component_type} {c.value ?? ""}</span>
                <Badge variant={c.condition === "known good" ? "success" : "secondary"}>{c.condition}</Badge>
              </div>
            ))}
            {(data?.length ?? 0) === 0 && <p className="text-sm text-muted-foreground">No components harvested yet.</p>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="destructive" onClick={() => setConfirmDelete(true)}><Trash2 /> Remove donor</Button>
          <Button variant="outline" onClick={async () => { await setDepleted(board.id, board.depleted === 0); onChanged(); onClose(); }}>
            {board.depleted === 1 ? "Mark available" : "Mark depleted"}
          </Button>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Remove this donor board?"
        description={`${board.brand} ${board.model} and its harvested components will be removed.`}
        confirmLabel="Remove"
        destructive
        onConfirm={async () => { await deleteDonorBoard(board.id); onChanged(); onClose(); }}
      />
    </Dialog>
  );
}
