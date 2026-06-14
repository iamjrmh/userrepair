import { useState } from "react";
import { Cpu, Plus, FileText, Star, Trash2, Microscope } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
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
import { Combobox } from "@/components/ui/combobox";
import { toast } from "@/components/ui/sonner";
import { useAsync } from "@/hooks/useAsync";
import {
  listBoardRevisions,
  createBoardRevision,
  listTestPoints,
  addTestPoint,
  listComponents,
  addComponent,
  listNets,
  addNet,
  listBoardAttachments,
  addBoardAttachment,
  deleteBoardAttachment,
} from "@/lib/repos/boards";
import {
  listMeasurements,
  createMeasurement,
  markKnownGood,
  deleteMeasurement,
  type MeasurementRow,
} from "@/lib/repos/measurements";
import type { MeasurementKind } from "@/types";

const KINDS: { value: MeasurementKind; label: string }[] = [
  { value: "voltage", label: "Voltage" },
  { value: "resistance", label: "Resistance" },
  { value: "diode", label: "Diode mode" },
  { value: "thermal", label: "Thermal" },
  { value: "scope", label: "Oscilloscope" },
  { value: "injection", label: "Injection" },
  { value: "microscope", label: "Microscope" },
];

export default function BoardToolsPage() {
  const { data: boards, reload: reloadBoards } = useAsync(listBoardRevisions, []);
  const [boardId, setBoardId] = useState("none");
  const selected = boardId === "none" ? null : Number(boardId);

  const { data: measurements, reload: reloadMeasurements } = useAsync(
    () => (selected === null ? Promise.resolve([]) : listMeasurements({ boardId: selected })),
    [selected],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Board Tools"
        description="Board-level measurements, known-good values, boardview files, and test-point / net / component indices per board revision."
      />

      <Card>
        <CardHeader><CardTitle>Board revision</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="w-80 space-y-1.5">
            <Label>Active board revision</Label>
            <Combobox
              options={(boards ?? []).map((b) => ({ value: String(b.id), label: `${b.device_model} - ${b.revision}` }))}
              value={boardId === "none" ? null : boardId}
              onChange={setBoardId}
              placeholder="Select a board revision"
              searchPlaceholder="Search boards / devices..."
            />
          </div>
          <NewBoardButton onCreated={reloadBoards} />
        </CardContent>
      </Card>

      {selected === null ? (
        <EmptyState icon={Cpu} title="Select a board revision" description="Pick or create a board revision to log measurements and manage its reference indices." />
      ) : (
        <>
        <BoardviewBar boardId={selected} />
        <Tabs defaultValue="measurements">
          <TabsList>
            <TabsTrigger value="measurements">Measurements</TabsTrigger>
            <TabsTrigger value="known">Known good</TabsTrigger>
            <TabsTrigger value="testpoints">Test points</TabsTrigger>
            <TabsTrigger value="nets">Nets</TabsTrigger>
            <TabsTrigger value="components">Components</TabsTrigger>
          </TabsList>
          <TabsContent value="measurements" className="space-y-4">
            <MeasurementForm boardId={selected} onSaved={reloadMeasurements} />
            <MeasurementList rows={measurements ?? []} onChanged={reloadMeasurements} />
          </TabsContent>
          <TabsContent value="known">
            <MeasurementList rows={(measurements ?? []).filter((m) => m.is_known_good === 1)} onChanged={reloadMeasurements} knownGoodView />
          </TabsContent>
          <TabsContent value="testpoints"><TestPoints boardId={selected} /></TabsContent>
          <TabsContent value="nets"><Nets boardId={selected} /></TabsContent>
          <TabsContent value="components"><Components boardId={selected} /></TabsContent>
        </Tabs>
        </>
      )}
    </div>
  );
}

function BoardviewBar({ boardId }: { boardId: number }) {
  const { data, reload } = useAsync(() => listBoardAttachments(boardId), [boardId]);
  const views = data ?? [];

  async function attach() {
    const file = await openDialog({
      multiple: false,
      directory: false,
      filters: [{ name: "Boardview / schematic", extensions: ["brd", "bdv", "bvr", "bv", "fz", "cad", "asc", "tvw", "f2b", "gr", "pdf"] }],
    });
    if (!file || Array.isArray(file)) return;
    const name = file.split(/[\\/]/).pop() ?? "boardview";
    try {
      await addBoardAttachment(boardId, file, name, "boardview");
      toast.success("Boardview attached");
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not attach boardview");
    }
  }

  async function open(rel: string) {
    const base = await invoke<string>("app_data_dir");
    const sep = base.endsWith("\\") || base.endsWith("/") ? "" : "\\";
    await invoke("open_external", { path: `${base}${sep}${rel}`.replace(/\//g, "\\") });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
      <span className="flex items-center gap-1.5 text-sm font-medium"><FileText className="h-4 w-4" /> Boardview</span>
      {views.map((a) => (
        <span key={a.id} className="flex items-center">
          <Button variant="outline" size="sm" onClick={() => void open(a.relative_path)} title={a.original_name}>
            Open {views.length > 1 ? a.original_name : "boardview"}
          </Button>
          <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" onClick={async () => { await deleteBoardAttachment(a.id); reload(); }} aria-label="Remove boardview">
            <Trash2 />
          </Button>
        </span>
      ))}
      <Button variant="ghost" size="sm" onClick={attach}><Plus /> Attach boardview</Button>
      {views.length === 0 && (
        <span className="text-xs text-muted-foreground">Opens in your boardview viewer. Attach a file you are licensed to use (ZXW / WuXinJi export, JCID, or your own).</span>
      )}
    </div>
  );
}

function NewBoardButton({ onCreated }: { onCreated: () => void }) {
  const [model, setModel] = useState("");
  const [rev, setRev] = useState("");

  async function create() {
    if (model.trim() === "" || rev.trim() === "") {
      toast.error("Model and revision required");
      return;
    }
    await createBoardRevision({ device_model: model, revision: rev, layer_count: null, primary_soc: null, pmic: null, notes: null });
    setModel("");
    setRev("");
    toast.success("Board revision created");
    onCreated();
  }

  return (
    <div className="flex items-end gap-2">
      <div className="space-y-1.5"><Label>New model</Label><Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="MacBook Pro 2019" className="w-44" /></div>
      <div className="space-y-1.5"><Label>Revision</Label><Input value={rev} onChange={(e) => setRev(e.target.value)} placeholder="820-01700" className="w-36" /></div>
      <Button variant="outline" onClick={create}><Plus /> Add</Button>
    </div>
  );
}

function MeasurementForm({ boardId, onSaved }: { boardId: number; onSaved: () => void }) {
  const [kind, setKind] = useState<MeasurementKind>("voltage");
  const [form, setForm] = useState({
    test_point: "",
    reference_designator: "",
    rail_name: "",
    power_state: "on",
    expected_value: "",
    measured_value: "",
    units: "V",
    notes: "",
  });
  function set<K extends keyof typeof form>(k: K, v: string) { setForm((f) => ({ ...f, [k]: v })); }

  async function submit() {
    await createMeasurement({
      ticket_id: null,
      board_revision_id: boardId,
      technician_id: null,
      kind,
      test_point: form.test_point || null,
      reference_designator: form.reference_designator || null,
      rail_name: form.rail_name || null,
      power_state: form.power_state || null,
      expected_value: form.expected_value || null,
      measured_value: form.measured_value || null,
      units: form.units || null,
      measurement_mode: null,
      orientation: null,
      signal_type: null,
      frequency: null,
      result: null,
      notes: form.notes || null,
    });
    setForm({ ...form, test_point: "", reference_designator: "", expected_value: "", measured_value: "", notes: "" });
    toast.success("Measurement logged");
    onSaved();
  }

  return (
    <Card>
      <CardHeader><CardTitle>Log measurement</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as MeasurementKind)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{KINDS.map((k) => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Test point</Label><Input value={form.test_point} onChange={(e) => set("test_point", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Reference</Label><Input value={form.reference_designator} onChange={(e) => set("reference_designator", e.target.value)} placeholder="U2 / C12" /></div>
          <div className="space-y-1.5"><Label>Rail / signal</Label><Input value={form.rail_name} onChange={(e) => set("rail_name", e.target.value)} placeholder="PP3V3_SUS" /></div>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="space-y-1.5"><Label>Expected</Label><Input value={form.expected_value} onChange={(e) => set("expected_value", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Measured</Label><Input value={form.measured_value} onChange={(e) => set("measured_value", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Units</Label><Input value={form.units} onChange={(e) => set("units", e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label>Power state</Label>
            <Select value={form.power_state} onValueChange={(v) => set("power_state", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="off">Off</SelectItem>
                <SelectItem value="standby">Standby</SelectItem>
                <SelectItem value="on">On</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5"><Label>Notes</Label><Input value={form.notes} onChange={(e) => set("notes", e.target.value)} /></div>
        <Button onClick={submit}><Plus /> Log measurement</Button>
      </CardContent>
    </Card>
  );
}

function MeasurementList({ rows, onChanged, knownGoodView }: { rows: MeasurementRow[]; onChanged: () => void; knownGoodView?: boolean }) {
  const [pendingDelete, setPendingDelete] = useState<number | null>(null);
  if (rows.length === 0) {
    return <EmptyState icon={Microscope} title={knownGoodView ? "No known-good values" : "No measurements"} description={knownGoodView ? "Star a measurement to add it to the reference set." : "Log your first measurement above."} />;
  }
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-card text-muted-foreground">
          <tr className="border-b border-border">
            <th className="px-3 py-2 text-left">Type</th>
            <th className="px-3 py-2 text-left">Point / Ref</th>
            <th className="px-3 py-2 text-left">Rail</th>
            <th className="px-3 py-2 text-left">Expected</th>
            <th className="px-3 py-2 text-left">Measured</th>
            <th className="px-3 py-2 text-left">State</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => (
            <tr key={m.id} className="border-b border-border/60">
              <td className="px-3 py-2"><Badge variant="secondary">{m.kind}</Badge></td>
              <td className="px-3 py-2 font-mono text-xs">{m.test_point ?? m.reference_designator ?? "-"}</td>
              <td className="px-3 py-2">{m.rail_name ?? "-"}</td>
              <td className="px-3 py-2 tabular-nums">{m.expected_value ?? "-"} {m.units ?? ""}</td>
              <td className="px-3 py-2 tabular-nums">{m.measured_value ?? "-"} {m.units ?? ""}</td>
              <td className="px-3 py-2">{m.power_state ?? "-"}</td>
              <td className="px-3 py-2 text-right">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className={m.is_known_good === 1 ? "text-accent" : "text-muted-foreground"}
                  onClick={async () => { await markKnownGood(m.id, m.is_known_good === 0); onChanged(); }}
                >
                  <Star />
                </Button>
                <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" onClick={() => setPendingDelete(m.id)}>
                  <Trash2 />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(o) => !o && setPendingDelete(null)}
        title="Remove this measurement?"
        description="The measurement will be removed."
        confirmLabel="Remove"
        destructive
        onConfirm={async () => { if (pendingDelete !== null) { await deleteMeasurement(pendingDelete); setPendingDelete(null); onChanged(); } }}
      />
    </div>
  );
}

function TestPoints({ boardId }: { boardId: number }) {
  const { data, reload } = useAsync(() => listTestPoints(boardId), [boardId]);
  const [f, setF] = useState({ label: "", location: "", v: "", r: "" });
  return (
    <Card>
      <CardContent className="space-y-3 pt-5">
        <div className="grid grid-cols-5 gap-2">
          <Input placeholder="Label" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} />
          <Input placeholder="Location" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} />
          <Input placeholder="Exp. voltage" value={f.v} onChange={(e) => setF({ ...f, v: e.target.value })} />
          <Input placeholder="Exp. resistance" value={f.r} onChange={(e) => setF({ ...f, r: e.target.value })} />
          <Button onClick={async () => { if (!f.label) return; await addTestPoint(boardId, f.label, f.location || null, f.v || null, f.r || null); setF({ label: "", location: "", v: "", r: "" }); reload(); }}><Plus /> Add</Button>
        </div>
        <div className="divide-y divide-border rounded-md border border-border">
          {(data ?? []).map((tp) => (
            <div key={tp.id} className="grid grid-cols-4 gap-2 px-3 py-2 text-sm">
              <span className="font-mono">{tp.label}</span>
              <span className="text-muted-foreground">{tp.location_desc ?? "-"}</span>
              <span className="tabular-nums">{tp.expected_voltage ?? "-"}</span>
              <span className="tabular-nums">{tp.expected_resistance ?? "-"}</span>
            </div>
          ))}
          {(data?.length ?? 0) === 0 && <div className="px-3 py-3 text-sm text-muted-foreground">No test points yet.</div>}
        </div>
      </CardContent>
    </Card>
  );
}

function Nets({ boardId }: { boardId: number }) {
  const { data, reload } = useAsync(() => listNets(boardId), [boardId]);
  const [f, setF] = useState({ net: "", tp: "", v: "", u: "" });
  return (
    <Card>
      <CardContent className="space-y-3 pt-5">
        <div className="grid grid-cols-5 gap-2">
          <Input placeholder="Net name" value={f.net} onChange={(e) => setF({ ...f, net: e.target.value })} />
          <Input placeholder="Test point" value={f.tp} onChange={(e) => setF({ ...f, tp: e.target.value })} />
          <Input placeholder="Expected" value={f.v} onChange={(e) => setF({ ...f, v: e.target.value })} />
          <Input placeholder="Units" value={f.u} onChange={(e) => setF({ ...f, u: e.target.value })} />
          <Button onClick={async () => { if (!f.net) return; await addNet(boardId, f.net, f.tp || null, f.v || null, f.u || null); setF({ net: "", tp: "", v: "", u: "" }); reload(); }}><Plus /> Add</Button>
        </div>
        <div className="divide-y divide-border rounded-md border border-border">
          {(data ?? []).map((n) => (
            <div key={n.id} className="grid grid-cols-4 gap-2 px-3 py-2 text-sm">
              <span className="font-mono">{n.net_name}</span>
              <span className="text-muted-foreground">{n.test_point ?? "-"}</span>
              <span className="tabular-nums">{n.expected_value ?? "-"} {n.units ?? ""}</span>
              <span></span>
            </div>
          ))}
          {(data?.length ?? 0) === 0 && <div className="px-3 py-3 text-sm text-muted-foreground">No nets yet.</div>}
        </div>
      </CardContent>
    </Card>
  );
}

function Components({ boardId }: { boardId: number }) {
  const { data, reload } = useAsync(() => listComponents(boardId), [boardId]);
  const [f, setF] = useState({ ref: "", type: "", value: "", part: "" });
  return (
    <Card>
      <CardContent className="space-y-3 pt-5">
        <div className="grid grid-cols-5 gap-2">
          <Input placeholder="Ref (U1)" value={f.ref} onChange={(e) => setF({ ...f, ref: e.target.value })} />
          <Input placeholder="Type" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} />
          <Input placeholder="Value" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} />
          <Input placeholder="Part #" value={f.part} onChange={(e) => setF({ ...f, part: e.target.value })} />
          <Button onClick={async () => { if (!f.ref) return; await addComponent(boardId, f.ref, f.type || null, f.value || null, f.part || null); setF({ ref: "", type: "", value: "", part: "" }); reload(); }}><Plus /> Add</Button>
        </div>
        <div className="divide-y divide-border rounded-md border border-border">
          {(data ?? []).map((c) => (
            <div key={c.id} className="grid grid-cols-4 gap-2 px-3 py-2 text-sm">
              <span className="font-mono">{c.reference_designator}</span>
              <span className="text-muted-foreground">{c.component_type ?? "-"}</span>
              <span>{c.value ?? "-"}</span>
              <span className="font-mono text-xs">{c.part_number ?? "-"}</span>
            </div>
          ))}
          {(data?.length ?? 0) === 0 && <div className="px-3 py-3 text-sm text-muted-foreground">No components indexed yet.</div>}
        </div>
      </CardContent>
    </Card>
  );
}
