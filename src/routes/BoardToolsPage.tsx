import { useState } from "react";
import { Cpu, Plus, ExternalLink } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Combobox } from "@/components/ui/combobox";
import { useAsync } from "@/hooks/useAsync";
import {
  listBoardRevisions,
  listTestPoints,
  addTestPoint,
  listComponents,
  addComponent,
  listNets,
  addNet,
} from "@/lib/repos/boards";

export default function BoardToolsPage() {
  const { data: boards } = useAsync(listBoardRevisions, []);
  const [boardId, setBoardId] = useState("none");
  const selected = boardId === "none" ? null : Number(boardId);

  async function openBoardview() {
    const file = await openDialog({
      multiple: false,
      directory: false,
      filters: [{ name: "Boardview / schematic", extensions: ["brd", "asc", "cad", "pdf"] }],
    });
    if (file && !Array.isArray(file)) {
      // No in-app boardview viewer: delegate to the OS default app (documented).
      await invoke("open_external", { path: file });
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Board Tools"
        description="Test-point, net, and component indices per board revision."
        actions={<Button variant="outline" onClick={openBoardview}><ExternalLink /> Open boardview file</Button>}
      />

      <Card>
        <CardHeader><CardTitle>Board revision</CardTitle></CardHeader>
        <CardContent>
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
          <p className="mt-2 text-xs text-muted-foreground">Create board revisions from the Microsoldering module.</p>
        </CardContent>
      </Card>

      {selected === null ? (
        <EmptyState icon={Cpu} title="Select a board revision" description="Choose a board to manage its reference indices." />
      ) : (
        <Tabs defaultValue="testpoints">
          <TabsList>
            <TabsTrigger value="testpoints">Test points</TabsTrigger>
            <TabsTrigger value="nets">Nets</TabsTrigger>
            <TabsTrigger value="components">Components</TabsTrigger>
          </TabsList>
          <TabsContent value="testpoints"><TestPoints boardId={selected} /></TabsContent>
          <TabsContent value="nets"><Nets boardId={selected} /></TabsContent>
          <TabsContent value="components"><Components boardId={selected} /></TabsContent>
        </Tabs>
      )}
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
