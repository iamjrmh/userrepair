import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Clock, Plus, Package, Trash2, Lock, Paperclip } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";
import { RichTextEditor } from "@/components/shared/RichTextEditor";
import { toast } from "@/components/ui/sonner";
import { useAsync } from "@/hooks/useAsync";
import { useTicketLock } from "@/hooks/useTicketLock";
import {
  getTicket,
  listTimeline,
  listNotes,
  addNote,
  changeStatus,
  listParts,
  consumePart,
  deleteTicket,
  listLabor,
  addLaborLine,
  deleteEstimateItem,
} from "@/lib/repos/tickets";
import { getSetting } from "@/lib/repos/settings";
import { getCustomer } from "@/lib/repos/customers";
import { notifyTicketStatus } from "@/lib/email";
import { listItems } from "@/lib/repos/inventory";
import { listTicketAttachments, deleteTicketAttachment } from "@/lib/repos/attachments";
import { attachmentUrl } from "@/lib/attachmentUrl";
import { statusVariant, priorityVariant, TICKET_STATUS_FLOW, TICKET_TERMINAL_STATUSES } from "@/lib/status";
import { formatDateTime, formatRelative, formatCents } from "@/lib/format";
import type { TicketStatus } from "@/types";

const ALL_STATUSES: TicketStatus[] = [...TICKET_STATUS_FLOW, ...TICKET_TERMINAL_STATUSES];

export default function TicketDetailPage() {
  const { id } = useParams();
  const ticketId = Number(id);
  const navigate = useNavigate();
  const [noteBody, setNoteBody] = useState("");
  const [noteInternal, setNoteInternal] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmTakeover, setConfirmTakeover] = useState(false);

  const editLock = useTicketLock(ticketId);
  const readOnly = editLock.status === "readonly";

  const { data, loading, reload } = useAsync(async () => {
    const ticket = await getTicket(ticketId);
    if (!ticket) return null;
    const [timeline, notes, parts] = await Promise.all([
      listTimeline(ticketId),
      listNotes(ticketId),
      listParts(ticketId),
    ]);
    return { ticket, timeline, notes, parts };
  }, [ticketId]);

  if (loading) return <div className="text-sm text-muted-foreground">Loading...</div>;
  if (!data || !data.ticket)
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => navigate("/tickets")}><ArrowLeft /> Back</Button>
        <p className="text-sm text-muted-foreground">Ticket not found.</p>
      </div>
    );

  const { ticket, timeline, notes, parts } = data;

  async function onStatusChange(to: string) {
    if (readOnly) return;
    await changeStatus(ticketId, ticket.status, to as TicketStatus, ticket.technician_id);
    toast.success(`Status set to ${to}`);
    reload();
    void notifyCustomer(to);
  }

  // Best-effort customer email on a status change (no-op unless enabled, the
  // status is opted in, and the customer has an email on file).
  async function notifyCustomer(to: string) {
    try {
      if (!ticket.customer_id) return;
      const customer = await getCustomer(ticket.customer_id);
      const res = await notifyTicketStatus({
        customerEmail: customer?.email ?? null,
        customerName: customer?.name ?? "there",
        ticketNumber: ticket.ticket_number,
        deviceLabel: ticket.device_label,
        status: to,
      });
      if (res.sent) toast.success(`Emailed ${customer?.name ?? "the customer"} the update`);
    } catch {
      toast.error("Status saved, but the email could not be sent");
    }
  }

  async function submitNote() {
    if (readOnly) return;
    if (noteBody.trim() === "" || noteBody === "<p></p>") return;
    await addNote(ticketId, noteBody, noteInternal, ticket.technician_id);
    setNoteBody("");
    toast.success("Note added");
    reload();
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate("/tickets")}><ArrowLeft /> Back to tickets</Button>
      <PageHeader
        title={ticket.title}
        description={`${ticket.ticket_number} - ${ticket.customer_name ?? "Walk-in"}`}
        actions={
          <div className="flex items-center gap-2">
            <Badge variant={priorityVariant(ticket.priority)}>{ticket.priority}</Badge>
            <Select value={ticket.status} onValueChange={onStatusChange} disabled={readOnly}>
              <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ALL_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="destructive" size="icon" aria-label="Remove ticket" disabled={readOnly} onClick={() => setConfirmDelete(true)}>
              <Trash2 />
            </Button>
          </div>
        }
      />

      {readOnly && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          <Lock className="h-4 w-4 shrink-0 text-warning" />
          <span className="flex-1">
            <span className="font-medium text-foreground">{editLock.lock?.holder_name ?? "Another user"}</span> is editing this ticket on another PC
            {editLock.lock?.heartbeat_at ? <span className="text-muted-foreground"> (active {formatRelative(editLock.lock.heartbeat_at)})</span> : null}. You are viewing it read-only.
          </span>
          <Button variant="outline" size="sm" onClick={() => setConfirmTakeover(true)}>Take over editing</Button>
        </div>
      )}

      <ConfirmDialog
        open={confirmTakeover}
        onOpenChange={setConfirmTakeover}
        title="Take over editing?"
        description={`Any unsaved changes ${editLock.lock?.holder_name ?? "the other editor"} has open could be lost. Only take over if that PC was left open by mistake.`}
        confirmLabel="Take over"
        destructive
        onConfirm={async () => {
          try {
            await editLock.takeOver();
            toast.success("You can now edit this ticket");
            reload();
          } catch {
            toast.error("Could not take over the lock");
          }
        }}
      />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Remove this ticket?"
        description={`${ticket.ticket_number} will be removed.`}
        confirmLabel="Remove"
        destructive
        onConfirm={async () => {
          await deleteTicket(ticketId);
          navigate("/tickets");
        }}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader><CardTitle>Symptom</CardTitle></CardHeader>
            <CardContent>
              {ticket.symptom_description ? (
                <div className="prose prose-sm dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: ticket.symptom_description }} />
              ) : (
                <p className="text-sm text-muted-foreground">No symptom description.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Notes</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <RichTextEditor value={noteBody} onChange={setNoteBody} />
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Switch checked={noteInternal} onCheckedChange={setNoteInternal} disabled={readOnly} />
                  {noteInternal ? "Internal note" : "Customer-facing"}
                </label>
                <Button size="sm" onClick={submitNote} disabled={readOnly}><Plus /> Add note</Button>
              </div>
              <div className="space-y-2">
                {notes.map((n) => (
                  <div key={n.id} className="rounded-md border border-border p-3">
                    <div className="mb-1 flex items-center gap-2">
                      <Badge variant={n.internal ? "secondary" : "accent"}>{n.internal ? "Internal" : "Customer"}</Badge>
                      <span className="text-xs text-muted-foreground">{formatRelative(n.created_at)}</span>
                    </div>
                    <div className="prose prose-sm dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: n.body }} />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <PartsCard ticketId={ticketId} parts={parts} technicianId={ticket.technician_id} onChanged={reload} disabled={readOnly} />

          <LaborCard ticketId={ticketId} disabled={readOnly} />

          <TicketAttachmentsCard ticketId={ticketId} disabled={readOnly} />
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Details</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="Status"><Badge variant={statusVariant(ticket.status)}>{ticket.status}</Badge></Row>
              <Row label="Type">{ticket.type}</Row>
              <Row label="Device">{ticket.device_label ?? "-"}</Row>
              <Row label="Technician">{ticket.technician_name ?? "Unassigned"}</Row>
              <Row label="Estimate">{formatCents(ticket.estimate_cents)}</Row>
              <Row label="Rework cycles">{ticket.rework_count}</Row>
              <Row label="Created">{formatDateTime(ticket.created_at)}</Row>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Clock className="h-4 w-4" /> Timeline</CardTitle></CardHeader>
            <CardContent>
              <ol className="space-y-3">
                {timeline.map((e) => (
                  <li key={e.id} className="relative pl-4">
                    <span className="absolute left-0 top-1.5 h-2 w-2 rounded-full bg-primary" />
                    <div className="text-sm">{e.detail ?? e.event}</div>
                    <div className="text-xs text-muted-foreground">{formatDateTime(e.created_at)}</div>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function LaborCard({ ticketId, disabled }: { ticketId: number; disabled?: boolean }) {
  const { data, reload } = useAsync(async () => {
    const rate = await getSetting<number>("finance.labor_rate_cents", 6000);
    const lines = await listLabor(ticketId);
    return { rate, lines };
  }, [ticketId]);
  const [hours, setHours] = useState("1");
  const rate = data?.rate ?? 6000;
  const lines = data?.lines ?? [];
  const total = lines.reduce((s, l) => s + Math.round(l.quantity * l.unit_price_cents), 0);

  async function add() {
    if (disabled) return;
    const h = parseFloat(hours);
    if (!Number.isFinite(h) || h <= 0) {
      toast.error("Enter labor hours");
      return;
    }
    await addLaborLine(ticketId, h, rate);
    setHours("1");
    toast.success("Labor added");
    reload();
  }

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><Clock className="h-4 w-4" /> Labor</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-end gap-2">
          <div className="space-y-1.5">
            <Label>Hours</Label>
            <Input type="number" step="0.1" value={hours} onChange={(e) => setHours(e.target.value)} className="w-24" />
          </div>
          <div className="text-sm text-muted-foreground">@ {formatCents(rate)}/hr = <span className="font-semibold text-foreground tabular-nums">{formatCents(Math.round((parseFloat(hours) || 0) * rate))}</span></div>
          <Button size="sm" className="ml-auto" onClick={add} disabled={disabled}><Plus /> Add labor</Button>
        </div>
        <div className="space-y-1.5">
          {lines.length === 0 ? (
            <p className="text-sm text-muted-foreground">No labor recorded.</p>
          ) : (
            lines.map((l) => (
              <div key={l.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                <span>{l.quantity} hr @ {formatCents(l.unit_price_cents)}/hr</span>
                <span className="flex items-center gap-2">
                  <span className="tabular-nums">{formatCents(Math.round(l.quantity * l.unit_price_cents))}</span>
                  <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" disabled={disabled} onClick={async () => { await deleteEstimateItem(l.id); reload(); }}>
                    <Trash2 />
                  </Button>
                </span>
              </div>
            ))
          )}
          {lines.length > 0 && (
            <div className="flex justify-between border-t border-border pt-1 text-sm font-semibold">
              <span>Labor total</span>
              <span className="tabular-nums">{formatCents(total)}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function TicketAttachmentsCard({ ticketId, disabled }: { ticketId: number; disabled?: boolean }) {
  const { data, reload } = useAsync(async () => {
    const rows = await listTicketAttachments(ticketId);
    return Promise.all(rows.map(async (row) => ({ row, url: await attachmentUrl(row.relative_path) })));
  }, [ticketId]);
  const items = data ?? [];

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><Paperclip className="h-4 w-4" /> Photos &amp; captures</CardTitle></CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No photos or videos yet. Capture from the Microsoldering tab and use Upload to attach one here.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {items.map(({ row, url }) => {
              const isVideo = /\.(webm|mp4|mov|mkv)$/i.test(row.relative_path);
              return (
                <div key={row.id} className="overflow-hidden rounded-lg border border-border bg-card">
                  <div className="aspect-video bg-black">
                    {isVideo ? (
                      <video src={url} controls className="h-full w-full object-contain" />
                    ) : (
                      <img src={url} alt={row.original_name} className="h-full w-full object-contain" />
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-1 p-2">
                    <span className="truncate text-xs text-muted-foreground" title={row.original_name}>{row.original_name}</span>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      disabled={disabled}
                      className="text-muted-foreground hover:text-destructive"
                      onClick={async () => { await deleteTicketAttachment(row.id); reload(); }}
                      aria-label="Remove attachment"
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{children}</span>
    </div>
  );
}

function PartsCard({
  ticketId,
  parts,
  technicianId,
  onChanged,
  disabled,
}: {
  ticketId: number;
  parts: { id: number; description: string; quantity: number; unit_cost_cents: number; item_id: number | null }[];
  technicianId: number | null;
  onChanged: () => void;
  disabled?: boolean;
}) {
  const { data: items } = useAsync(listItems, []);
  const [itemId, setItemId] = useState("none");
  const [desc, setDesc] = useState("");
  const [qty, setQty] = useState("1");

  async function add() {
    if (disabled) return;
    const selected = (items ?? []).find((i) => String(i.id) === itemId);
    const description = selected ? selected.description : desc.trim();
    if (description === "") {
      toast.error("Pick a part or enter a description");
      return;
    }
    try {
      await consumePart({
        ticketId,
        itemId: selected ? selected.id : null,
        description,
        quantity: Number(qty) || 1,
        unitCostCents: selected ? selected.unit_cost_cents : 0,
        technicianId,
      });
      toast.success("Part added");
      setItemId("none");
      setDesc("");
      setQty("1");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><Package className="h-4 w-4" /> Parts consumed</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <Combobox
            options={[{ value: "none", label: "Free text part" }, ...(items ?? []).map((i) => ({ value: String(i.id), label: i.description, hint: `qty ${i.quantity}` }))]}
            value={itemId}
            onChange={setItemId}
            placeholder="From inventory"
            searchPlaceholder="Search inventory..."
          />
          <Input className="w-20" type="number" value={qty} onChange={(e) => setQty(e.target.value)} />
        </div>
        {itemId === "none" && (
          <div className="space-y-1.5">
            <Label>Part description</Label>
            <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Tristar IC, U2 connector..." />
          </div>
        )}
        <Button size="sm" onClick={add} disabled={disabled}><Plus /> Add part</Button>
        <div className="space-y-1.5">
          {parts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No parts recorded.</p>
          ) : (
            parts.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                <span>{p.description} x{p.quantity}</span>
                <span className="tabular-nums text-muted-foreground">{formatCents(p.unit_cost_cents * p.quantity)}</span>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
