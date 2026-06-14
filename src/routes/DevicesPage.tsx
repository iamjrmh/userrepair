import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ColumnDef } from "@tanstack/react-table";
import { Smartphone, Plus, Search, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { EmptyState } from "@/components/shared/EmptyState";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
import { toast } from "@/components/ui/sonner";
import { useAsync } from "@/hooks/useAsync";
import {
  listDevices,
  createDevice,
  updateDeviceNotes,
  deleteDevice,
  modelRepairHistory,
  type DeviceWithCustomer,
} from "@/lib/repos/devices";
import { listCustomers } from "@/lib/repos/customers";
import { deviceSchema, type DeviceInput, type DeviceFormValues } from "@/lib/validators";
import { statusVariant } from "@/lib/status";
import { formatDateTime } from "@/lib/format";
import type { DeviceCategory, TicketStatus } from "@/types";

const CATEGORIES: DeviceCategory[] = [
  "Smartphone",
  "Tablet",
  "Laptop",
  "Desktop Motherboard",
  "Game Console",
  "TV",
  "Other",
];

export default function DevicesPage() {
  const { data, loading, reload } = useAsync(listDevices, []);
  const [filter, setFilter] = useState("");
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<DeviceWithCustomer | null>(null);

  const columns = useMemo<ColumnDef<DeviceWithCustomer, unknown>[]>(
    () => [
      { accessorKey: "brand", header: "Brand", cell: (c) => <span className="font-medium">{c.row.original.brand}</span> },
      { accessorKey: "model", header: "Model" },
      { accessorKey: "model_number", header: "Model #", cell: (c) => <span className="font-mono text-xs">{c.row.original.model_number ?? "-"}</span> },
      { accessorKey: "category", header: "Category", cell: (c) => <Badge variant="secondary">{c.row.original.category}</Badge> },
      { accessorKey: "serial_number", header: "Serial", cell: (c) => <span className="font-mono text-xs">{c.row.original.serial_number ?? "-"}</span> },
      { accessorKey: "customer_name", header: "Owner", cell: (c) => c.row.original.customer_name ?? "-" },
    ],
    [],
  );

  return (
    <div className="flex h-full flex-col gap-4">
      <PageHeader
        title="Devices"
        description="Every device the shop has handled, with model repair history."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus /> New device
          </Button>
        }
      />
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter devices..." className="pl-8" />
      </div>
      <div className="min-h-0 flex-1">
        {loading ? (
          <Skeleton className="h-full w-full" />
        ) : (
          <DataTable
            columns={columns}
            data={data ?? []}
            globalFilter={filter}
            onRowClick={(row) => setSelected(row)}
            empty={
              <EmptyState
                icon={Smartphone}
                title="No devices yet"
                description="Devices are added here or inline when creating a ticket."
                action={<Button onClick={() => setOpen(true)}><Plus /> New device</Button>}
              />
            }
          />
        )}
      </div>
      <DeviceFormDialog open={open} onOpenChange={setOpen} onSaved={reload} />
      {selected && (
        <DeviceDetailDialog device={selected} onClose={() => setSelected(null)} onChanged={reload} />
      )}
    </div>
  );
}

function DeviceDetailDialog({
  device,
  onClose,
  onChanged,
}: {
  device: DeviceWithCustomer;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [notes, setNotes] = useState(device.notes ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { data: history } = useAsync(() => modelRepairHistory(device.brand, device.model), [device.id]);

  async function saveNotes() {
    await updateDeviceNotes(device.id, notes);
    toast.success("Notes saved");
    onChanged();
  }

  async function remove() {
    await deleteDevice(device.id);
    toast.success("Device removed");
    onClose();
    onChanged();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{device.brand} {device.model}</DialogTitle>
          <DialogDescription>{device.category}{device.model_number ? ` - ${device.model_number}` : ""}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <Info label="Owner" value={device.customer_name ?? "Unassigned"} />
            <Info label="Model number" value={device.model_number ?? "-"} />
            <Info label="Serial" value={device.serial_number ?? "-"} mono />
            <Info label="IMEI" value={device.imei ?? "-"} mono />
            <Info label="Variant" value={device.variant ?? "-"} />
            <Info label="Asset tag" value={device.asset_tag ?? "-"} />
          </dl>

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
            <div className="flex justify-end">
              <Button size="sm" variant="outline" onClick={saveNotes}>Save notes</Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Repair history for this model</Label>
            {(history?.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">No tickets recorded for {device.brand} {device.model}.</p>
            ) : (
              <div className="max-h-40 space-y-1 overflow-y-auto">
                {(history ?? []).map((t) => (
                  <div key={t.id} className="flex items-center justify-between rounded-md border border-border px-2.5 py-1.5 text-sm">
                    <span className="font-mono text-xs">{t.ticket_number}</span>
                    <span className="truncate px-2 text-muted-foreground">{t.title}</span>
                    <Badge variant={statusVariant(t.status as TicketStatus)}>{t.status}</Badge>
                  </div>
                ))}
                <div className="pt-1 text-xs text-muted-foreground">Last updated {formatDateTime(device.updated_at)}</div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="destructive" onClick={() => setConfirmDelete(true)}>
            <Trash2 /> Remove device
          </Button>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Remove this device?"
        description={`${device.brand} ${device.model} will be removed. Linked tickets keep their history.`}
        confirmLabel="Remove"
        destructive
        onConfirm={remove}
      />
    </Dialog>
  );
}

function Info({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={mono ? "font-mono text-sm" : "text-sm"}>{value}</dd>
    </div>
  );
}

function DeviceFormDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const { data: customers } = useAsync(listCustomers, []);
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<DeviceFormValues, unknown, DeviceInput>({
    resolver: zodResolver(deviceSchema),
    defaultValues: {
      customer_id: null,
      category: "Smartphone",
      brand: "",
      model: "",
      model_number: "",
      variant: "",
      serial_number: "",
      imei: "",
      asset_tag: "",
      notes: "",
    },
  });

  async function onSubmit(values: DeviceInput) {
    await createDevice(values);
    toast.success("Device added");
    reset();
    onOpenChange(false);
    onSaved();
  }

  const customerId = watch("customer_id");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New device</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Brand</Label>
              <Input {...register("brand")} placeholder="Apple" />
              {errors.brand && <p className="text-xs text-destructive">{errors.brand.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Model</Label>
              <Input {...register("model")} placeholder="iPhone 13" />
              {errors.model && <p className="text-xs text-destructive">{errors.model.message}</p>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={watch("category")} onValueChange={(v) => setValue("category", v as DeviceCategory)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Owner</Label>
              <Combobox
                options={[{ value: "none", label: "Unassigned" }, ...(customers ?? []).map((c) => ({ value: String(c.id), label: c.name }))]}
                value={customerId === null ? "none" : String(customerId)}
                onChange={(v) => setValue("customer_id", v === "none" ? null : Number(v))}
                placeholder="Unassigned"
                searchPlaceholder="Search customers..."
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Model number</Label>
              <Input {...register("model_number")} placeholder="A2342 / SM-G991B" />
            </div>
            <div className="space-y-1.5">
              <Label>Variant</Label>
              <Input {...register("variant")} placeholder="128GB / EU" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Serial number</Label>
              <Input {...register("serial_number")} />
            </div>
            <div className="space-y-1.5">
              <Label>IMEI</Label>
              <Input {...register("imei")} placeholder="15 digits" />
              {errors.imei && <p className="text-xs text-destructive">{errors.imei.message}</p>}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea {...register("notes")} rows={2} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>Add device</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
