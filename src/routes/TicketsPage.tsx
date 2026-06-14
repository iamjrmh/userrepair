import { useMemo, useState, useEffect, type DragEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ColumnDef } from "@tanstack/react-table";
import { Ticket as TicketIcon, Plus } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { EmptyState } from "@/components/shared/EmptyState";
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
import { Combobox } from "@/components/ui/combobox";
import { RichTextEditor } from "@/components/shared/RichTextEditor";
import { toast } from "@/components/ui/sonner";
import { useAsync } from "@/hooks/useAsync";
import { listTickets, createTicket, changeStatus, type TicketRow } from "@/lib/repos/tickets";
import { listCustomers } from "@/lib/repos/customers";
import { listTechnicians } from "@/lib/repos/technicians";
import { ticketSchema, type TicketInput, type TicketFormValues } from "@/lib/validators";
import { statusVariant, priorityVariant, TICKET_STATUS_FLOW } from "@/lib/status";
import { CustomerFormDialog } from "@/components/customers/CustomerFormDialog";
import { formatDate } from "@/lib/format";
import type { TicketStatus, TicketPriority, TicketType } from "@/types";

const TYPES: TicketType[] = [
  "Microsoldering",
  "Component Repair",
  "Diagnostic Only",
  "Data Recovery",
  "Cleaning",
  "General Repair",
  "Other",
];
const PRIORITIES: TicketPriority[] = ["Critical", "High", "Normal", "Low"];

export default function TicketsPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { data, loading, reload } = useAsync(listTickets, []);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    if (params.get("new") === "1") {
      setCreateOpen(true);
      params.delete("new");
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

  const columns = useMemo<ColumnDef<TicketRow, unknown>[]>(
    () => [
      { accessorKey: "ticket_number", header: "Ticket", cell: (c) => <span className="font-mono text-xs">{c.row.original.ticket_number}</span> },
      { accessorKey: "title", header: "Title", cell: (c) => <span className="font-medium">{c.row.original.title}</span> },
      { accessorKey: "customer_name", header: "Customer", cell: (c) => c.row.original.customer_name ?? "-" },
      { accessorKey: "priority", header: "Priority", cell: (c) => <Badge variant={priorityVariant(c.row.original.priority)}>{c.row.original.priority}</Badge> },
      { accessorKey: "status", header: "Status", cell: (c) => <Badge variant={statusVariant(c.row.original.status)}>{c.row.original.status}</Badge> },
      { accessorKey: "due_date", header: "Due", cell: (c) => <span className="tabular-nums">{formatDate(c.row.original.due_date)}</span> },
    ],
    [],
  );

  async function onDropStatus(ticket: TicketRow, to: TicketStatus) {
    if (ticket.status === to) return;
    await changeStatus(ticket.id, ticket.status, to, ticket.technician_id);
    toast.success(`${ticket.ticket_number} -> ${to}`);
    reload();
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <PageHeader
        title="Repair Tickets"
        description="Full lifecycle from intake to pickup."
        actions={<Button onClick={() => setCreateOpen(true)}><Plus /> New ticket</Button>}
      />

      <Tabs defaultValue="board" className="flex min-h-0 flex-1 flex-col">
        <TabsList className="w-fit">
          <TabsTrigger value="board">Board</TabsTrigger>
          <TabsTrigger value="list">List</TabsTrigger>
        </TabsList>

        <TabsContent value="board" className="min-h-0 flex-1">
          {loading ? (
            <Skeleton className="h-full w-full" />
          ) : (data?.length ?? 0) === 0 ? (
            <EmptyState icon={TicketIcon} title="No tickets" description="Create your first repair ticket." action={<Button onClick={() => setCreateOpen(true)}><Plus /> New ticket</Button>} />
          ) : (
            <div className="flex h-full gap-3 overflow-x-auto pb-2">
              {TICKET_STATUS_FLOW.map((status) => {
                const items = (data ?? []).filter((t) => t.status === status);
                return (
                  <KanbanColumn
                    key={status}
                    status={status}
                    tickets={items}
                    onDrop={onDropStatus}
                    onOpen={(id) => navigate(`/tickets/${id}`)}
                  />
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="list" className="min-h-0 flex-1">
          {loading ? (
            <Skeleton className="h-full w-full" />
          ) : (
            <DataTable
              columns={columns}
              data={data ?? []}
              onRowClick={(t) => navigate(`/tickets/${t.id}`)}
              empty={<EmptyState icon={TicketIcon} title="No tickets" description="Create your first repair ticket." />}
            />
          )}
        </TabsContent>
      </Tabs>

      <TicketFormDialog open={createOpen} onOpenChange={setCreateOpen} onSaved={reload} types={TYPES} priorities={PRIORITIES} />
    </div>
  );
}

function KanbanColumn({
  status,
  tickets,
  onDrop,
  onOpen,
}: {
  status: TicketStatus;
  tickets: TicketRow[];
  onDrop: (ticket: TicketRow, to: TicketStatus) => void;
  onOpen: (id: number) => void;
}) {
  const [over, setOver] = useState(false);

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setOver(false);
    const id = Number(e.dataTransfer.getData("text/ticket-id"));
    const ticket = tickets.find((t) => t.id === id);
    // The dragged ticket lives in another column; reconstruct minimally.
    if (!ticket) {
      const payload = e.dataTransfer.getData("application/json");
      if (payload) {
        try {
          const parsed = JSON.parse(payload) as TicketRow;
          onDrop(parsed, status);
        } catch {
          // ignore malformed payloads
        }
      }
      return;
    }
    onDrop(ticket, status);
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={handleDrop}
      className={`flex w-72 shrink-0 flex-col rounded-lg border bg-card/50 ${over ? "border-primary" : "border-border"}`}
    >
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-sm font-medium">{status}</span>
        <Badge variant="secondary">{tickets.length}</Badge>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-2">
        {tickets.map((t) => (
          <div
            key={t.id}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("text/ticket-id", String(t.id));
              e.dataTransfer.setData("application/json", JSON.stringify(t));
            }}
            onClick={() => onOpen(t.id)}
            className="cursor-pointer rounded-md border border-border bg-card p-2.5 text-sm shadow-sm hover:border-ring"
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] text-muted-foreground">{t.ticket_number}</span>
              <Badge variant={priorityVariant(t.priority)}>{t.priority}</Badge>
            </div>
            <div className="mt-1 font-medium leading-snug">{t.title}</div>
            <div className="mt-1 text-xs text-muted-foreground">{t.customer_name ?? "No customer"}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TicketFormDialog({
  open,
  onOpenChange,
  onSaved,
  types,
  priorities,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
  types: TicketType[];
  priorities: TicketPriority[];
}) {
  const { data: customers, reload: reloadCustomers } = useAsync(listCustomers, []);
  const { data: techs } = useAsync(() => listTechnicians(false), []);
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<TicketFormValues, unknown, TicketInput>({
    resolver: zodResolver(ticketSchema),
    defaultValues: {
      customer_id: null,
      device_id: null,
      technician_id: null,
      title: "",
      type: "General Repair",
      priority: "Normal",
      due_date: "",
      symptom_description: "",
    },
  });

  async function onSubmit(values: TicketInput) {
    const { number } = await createTicket(values);
    toast.success(`Created ${number}`);
    reset();
    onOpenChange(false);
    onSaved();
  }

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>New ticket</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input {...register("title")} placeholder="No power after liquid damage" />
            {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Customer (required)</Label>
                <button type="button" onClick={() => setNewCustomerOpen(true)} className="text-xs text-primary hover:underline cursor-pointer">
                  + New customer
                </button>
              </div>
              <Combobox
                options={(customers ?? []).map((c) => ({ value: String(c.id), label: c.name, hint: c.phone ?? undefined }))}
                value={watch("customer_id") === null ? null : String(watch("customer_id"))}
                onChange={(v) => setValue("customer_id", Number(v), { shouldValidate: true })}
                placeholder="Select a customer"
                searchPlaceholder="Search customers..."
              />
              {errors.customer_id && <p className="text-xs text-destructive">{errors.customer_id.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Technician</Label>
              <Combobox
                options={[{ value: "none", label: "Unassigned" }, ...(techs ?? []).map((t) => ({ value: String(t.id), label: t.name }))]}
                value={watch("technician_id") === null ? "none" : String(watch("technician_id"))}
                onChange={(v) => setValue("technician_id", v === "none" ? null : Number(v))}
                placeholder="Unassigned"
                searchPlaceholder="Search technicians..."
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={watch("type")} onValueChange={(v) => setValue("type", v as TicketType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{types.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={watch("priority")} onValueChange={(v) => setValue("priority", v as TicketPriority)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{priorities.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Due date</Label>
              <Input type="date" {...register("due_date")} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Symptom</Label>
            <RichTextEditor value={watch("symptom_description") ?? ""} onChange={(html) => setValue("symptom_description", html)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>Create ticket</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    <CustomerFormDialog open={newCustomerOpen} onOpenChange={setNewCustomerOpen} onSaved={reloadCustomers} />
    </>
  );
}
