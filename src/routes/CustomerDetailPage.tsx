import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Pencil, Trash2, Phone, Mail, MapPin, Smartphone, Ticket as TicketIcon, Gift } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useAsync } from "@/hooks/useAsync";
import {
  getCustomer,
  listCustomerDevices,
  listCustomerTickets,
  customerLifetimeSpend,
  listCommunications,
  addCommunication,
  deleteCustomer,
} from "@/lib/repos/customers";
import { listLedger, adjustPoints } from "@/lib/repos/rewards";
import { useAuthStore } from "@/stores/auth";
import { formatCents, formatDateTime, formatRelative } from "@/lib/format";
import { statusVariant } from "@/lib/status";
import { CustomerFormDialog } from "@/components/customers/CustomerFormDialog";
import { toast } from "@/components/ui/sonner";
import type { TicketStatus } from "@/types";

export default function CustomerDetailPage() {
  const { id } = useParams();
  const customerId = Number(id);
  const navigate = useNavigate();
  const role = useAuthStore((s) => s.user?.role);
  const isManager = role === "owner" || role === "manager";
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [comm, setComm] = useState("");

  const { data, loading, reload } = useAsync(async () => {
    const customer = await getCustomer(customerId);
    if (!customer) return null;
    const [devices, tickets, spend, comms, ledger] = await Promise.all([
      listCustomerDevices(customerId),
      listCustomerTickets(customerId),
      customerLifetimeSpend(customerId),
      listCommunications(customerId),
      listLedger(customerId),
    ]);
    return { customer, devices, tickets, spend, comms, ledger };
  }, [customerId]);

  if (loading) return <div className="text-sm text-muted-foreground">Loading...</div>;
  if (!data || !data.customer)
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => navigate("/customers")}>
          <ArrowLeft /> Back
        </Button>
        <p className="text-sm text-muted-foreground">Customer not found.</p>
      </div>
    );

  const { customer, devices, tickets, spend, comms, ledger } = data;

  async function logComm() {
    if (comm.trim() === "") return;
    await addCommunication(customerId, "phone", comm.trim(), null);
    setComm("");
    reload();
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate("/customers")}>
        <ArrowLeft /> Back to customers
      </Button>
      <PageHeader
        title={customer.name}
        description={customer.company ?? undefined}
        actions={
          <>
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil /> Edit
            </Button>
            <Button variant="destructive" onClick={() => setConfirmDelete(true)}>
              <Trash2 /> Remove
            </Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Contact</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" /> {customer.phone ?? "-"}</div>
            <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-muted-foreground" /> {customer.email ?? "-"}</div>
            <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-muted-foreground" /> {customer.address ?? "-"}</div>
            <Badge variant="secondary">Prefers {customer.preferred_contact}</Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Lifetime value</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold tabular-nums">{formatCents(spend)}</div>
            <p className="mt-1 text-sm text-muted-foreground">
              Outstanding {formatCents(customer.outstanding_cents)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Activity</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {tickets.length} tickets, {devices.length} devices
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Smartphone className="h-4 w-4" /> Devices</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {devices.length === 0 ? (
              <p className="text-sm text-muted-foreground">No devices recorded.</p>
            ) : (
              devices.map((d) => (
                <div key={d.id} className="rounded-md border border-border px-3 py-2 text-sm">
                  <div className="font-medium">{d.brand} {d.model}</div>
                  <div className="text-xs text-muted-foreground">{d.category}{d.serial_number ? ` - SN ${d.serial_number}` : ""}</div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><TicketIcon className="h-4 w-4" /> Repair history</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {tickets.length === 0 ? (
              <p className="text-sm text-muted-foreground">No tickets yet.</p>
            ) : (
              tickets.map((t) => (
                <Link
                  key={t.id}
                  to={`/tickets/${t.id}`}
                  className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary/40"
                >
                  <span className="font-mono text-xs">{t.ticket_number}</span>
                  <span className="truncate px-2">{t.title}</span>
                  <Badge variant={statusVariant(t.status as TicketStatus)}>{t.status}</Badge>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Communication log</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              value={comm}
              onChange={(e) => setComm(e.target.value)}
              placeholder="Called customer, left voicemail..."
            />
            <Button onClick={logComm}>Log</Button>
          </div>
          <div className="space-y-2">
            {comms.map((c) => (
              <div key={c.id} className="rounded-md border border-border px-3 py-2 text-sm">
                <div>{c.body}</div>
                <div className="mt-1 text-xs text-muted-foreground">{formatRelative(c.created_at)} - {formatDateTime(c.created_at)}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Gift className="h-4 w-4" /> Rewards</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="text-2xl font-semibold tabular-nums">{customer.points_balance} points</div>
          {isManager && <PointsAdjust customerId={customerId} onChanged={reload} />}
          <div className="space-y-1">
            {ledger.length === 0 ? (
              <p className="text-sm text-muted-foreground">No points activity.</p>
            ) : (
              ledger.map((e) => (
                <div key={e.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                  <span>{e.reason ?? (e.delta_points >= 0 ? "Earned" : "Redeemed")}</span>
                  <span className="flex items-center gap-3">
                    <span className={`tabular-nums ${e.delta_points >= 0 ? "text-success" : "text-destructive"}`}>{e.delta_points >= 0 ? "+" : ""}{e.delta_points}</span>
                    <span className="text-xs text-muted-foreground">bal {e.balance_after}</span>
                    <span className="text-xs text-muted-foreground">{formatRelative(e.created_at)}</span>
                  </span>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <CustomerFormDialog open={editOpen} onOpenChange={setEditOpen} onSaved={reload} existing={customer} />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Remove this customer?"
        description={`${customer.name} will be removed. Their tickets keep their history.`}
        confirmLabel="Remove"
        destructive
        onConfirm={async () => {
          await deleteCustomer(customerId);
          navigate("/customers");
        }}
      />
    </div>
  );
}

function PointsAdjust({ customerId, onChanged }: { customerId: number; onChanged: () => void }) {
  const [points, setPoints] = useState("");
  const [reason, setReason] = useState("");
  async function apply() {
    const delta = Math.round(Number(points) || 0);
    if (delta === 0) {
      toast.error("Enter points to add or remove");
      return;
    }
    await adjustPoints(customerId, delta, reason.trim() || "Manual adjustment");
    setPoints("");
    setReason("");
    toast.success("Points adjusted");
    onChanged();
  }
  return (
    <div className="flex items-end gap-2 rounded-md border border-border p-2">
      <Input type="number" value={points} onChange={(e) => setPoints(e.target.value)} placeholder="+/- points" className="h-8 w-28" />
      <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" className="h-8 flex-1" />
      <Button size="sm" onClick={apply}>Adjust</Button>
    </div>
  );
}
