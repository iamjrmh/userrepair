import { useState } from "react";
import { Lightbulb, Plus, ThumbsUp, ThumbsDown, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "@/components/ui/sonner";
import { useAsync } from "@/hooks/useAsync";
import {
  listFaults,
  createFault,
  deleteFault,
  listSolutions,
  createSolution,
  recordSolutionOutcome,
  deleteSolution,
} from "@/lib/repos/intelligence";

const FAULT_CATEGORIES = [
  "No Power", "No Backlight", "No Display", "No Charging", "Liquid Damage",
  "Short Circuit", "Missing Rails", "Boot Loop", "No Boot", "Data Recovery", "Other",
];

export default function IntelligencePage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Repair Intelligence" description="Shop knowledge: known faults and proven solutions." />
      <Tabs defaultValue="solutions">
        <TabsList>
          <TabsTrigger value="solutions">Solution library</TabsTrigger>
          <TabsTrigger value="faults">Fault database</TabsTrigger>
        </TabsList>
        <TabsContent value="solutions"><Solutions /></TabsContent>
        <TabsContent value="faults"><Faults /></TabsContent>
      </Tabs>
    </div>
  );
}

function Solutions() {
  const { data, reload } = useAsync(listSolutions, []);
  const [form, setForm] = useState({ device_model: "", fault_category: "No Power", title: "", solution: "" });
  const [pendingDelete, setPendingDelete] = useState<number | null>(null);
  function set<K extends keyof typeof form>(k: K, v: string) { setForm((f) => ({ ...f, [k]: v })); }

  async function add() {
    if (form.title.trim() === "" || form.solution.trim() === "") {
      toast.error("Title and solution are required");
      return;
    }
    await createSolution({ device_model: form.device_model || null, fault_category: form.fault_category, title: form.title, solution: form.solution });
    setForm({ device_model: "", fault_category: "No Power", title: "", solution: "" });
    toast.success("Solution saved");
    reload();
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-1">
        <CardHeader><CardTitle>New solution</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5"><Label>Device model</Label><Input value={form.device_model} onChange={(e) => set("device_model", e.target.value)} placeholder="iPhone 12" /></div>
          <div className="space-y-1.5"><Label>Title</Label><Input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Tristar replacement fixes no-charge" /></div>
          <div className="space-y-1.5"><Label>Solution</Label><Textarea rows={4} value={form.solution} onChange={(e) => set("solution", e.target.value)} /></div>
          <Button onClick={add}><Plus /> Save solution</Button>
        </CardContent>
      </Card>
      <div className="space-y-3 lg:col-span-2">
        {(data?.length ?? 0) === 0 ? (
          <EmptyState icon={Lightbulb} title="No solutions yet" description="Confirmed fixes accumulate here with success counts." />
        ) : (
          (data ?? []).map((s) => (
            <Card key={s.id}>
              <CardContent className="space-y-2 p-4">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{s.title}</span>
                  <div className="flex items-center gap-2">
                    {s.device_model && <Badge variant="secondary">{s.device_model}</Badge>}
                    <Badge variant="success">{s.success_count} fixed</Badge>
                  </div>
                </div>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">{s.solution}</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={async () => { await recordSolutionOutcome(s.id, true); reload(); }}><ThumbsUp /> Worked</Button>
                  <Button size="sm" variant="outline" onClick={async () => { await recordSolutionOutcome(s.id, false); reload(); }}><ThumbsDown /> Failed</Button>
                  <Button size="sm" variant="ghost" className="ml-auto text-muted-foreground" onClick={() => setPendingDelete(s.id)}><Trash2 /></Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(o) => !o && setPendingDelete(null)}
        title="Remove this solution?"
        description="The solution will be removed from the library."
        confirmLabel="Remove"
        destructive
        onConfirm={async () => { if (pendingDelete !== null) { await deleteSolution(pendingDelete); setPendingDelete(null); reload(); } }}
      />
    </div>
  );
}

function Faults() {
  const { data, reload } = useAsync(listFaults, []);
  const [form, setForm] = useState({ device_model: "", category: "No Power", state: "suspected", common_cause: "", component_ref: "", reasoning: "" });
  const [pendingDelete, setPendingDelete] = useState<number | null>(null);
  function set<K extends keyof typeof form>(k: K, v: string) { setForm((f) => ({ ...f, [k]: v })); }

  async function add() {
    await createFault({
      ticket_id: null,
      device_model: form.device_model || null,
      category: form.category,
      state: form.state,
      common_cause: form.common_cause || null,
      reasoning: form.reasoning || null,
      component_ref: form.component_ref || null,
    });
    setForm({ device_model: "", category: "No Power", state: "suspected", common_cause: "", component_ref: "", reasoning: "" });
    toast.success("Fault logged");
    reload();
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-1">
        <CardHeader><CardTitle>Log fault</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5"><Label>Device model</Label><Input value={form.device_model} onChange={(e) => set("device_model", e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label>Category</Label>
            <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.category} onChange={(e) => set("category", e.target.value)}>
              {FAULT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="space-y-1.5"><Label>Common cause</Label><Input value={form.common_cause} onChange={(e) => set("common_cause", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Component</Label><Input value={form.component_ref} onChange={(e) => set("component_ref", e.target.value)} placeholder="U2 / Q3" /></div>
          <div className="space-y-1.5"><Label>Reasoning</Label><Textarea rows={3} value={form.reasoning} onChange={(e) => set("reasoning", e.target.value)} /></div>
          <Button onClick={add}><Plus /> Log fault</Button>
        </CardContent>
      </Card>
      <div className="space-y-2 lg:col-span-2">
        {(data?.length ?? 0) === 0 ? (
          <EmptyState icon={Lightbulb} title="No faults logged" description="Build a searchable history of confirmed and suspected faults." />
        ) : (
          (data ?? []).map((f) => (
            <div key={f.id} className="rounded-md border border-border p-3">
              <div className="flex items-center justify-between">
                <span className="font-medium">{f.category}</span>
                <div className="flex items-center gap-2">
                  {f.device_model && <Badge variant="secondary">{f.device_model}</Badge>}
                  <Badge variant={f.state === "confirmed" ? "success" : f.state === "ruled-out" ? "destructive" : "warning"}>{f.state}</Badge>
                  <button type="button" aria-label="Remove" onClick={() => setPendingDelete(f.id)} className="text-muted-foreground hover:text-destructive cursor-pointer">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              {f.common_cause && <p className="mt-1 text-sm text-muted-foreground">Cause: {f.common_cause}</p>}
              {f.component_ref && <p className="text-xs font-mono text-muted-foreground">{f.component_ref}</p>}
            </div>
          ))
        )}
      </div>
      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(o) => !o && setPendingDelete(null)}
        title="Remove this fault record?"
        description="The fault record will be removed."
        confirmLabel="Remove"
        destructive
        onConfirm={async () => { if (pendingDelete !== null) { await deleteFault(pendingDelete); setPendingDelete(null); reload(); } }}
      />
    </div>
  );
}
