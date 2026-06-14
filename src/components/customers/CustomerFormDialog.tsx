import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { customerSchema, type CustomerInput, type CustomerFormValues } from "@/lib/validators";
import {
  createCustomer,
  updateCustomer,
  findDuplicateCustomers,
} from "@/lib/repos/customers";
import type { Customer } from "@/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (id: number) => void;
  existing?: Customer;
}

export function CustomerFormDialog({ open, onOpenChange, onSaved, existing }: Props) {
  const [dupes, setDupes] = useState<Customer[]>([]);
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CustomerFormValues, unknown, CustomerInput>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      name: "",
      company: "",
      phone: "",
      email: "",
      address: "",
      preferred_contact: "phone",
      notes: "",
    },
  });

  useEffect(() => {
    if (open) {
      reset({
        name: existing?.name ?? "",
        company: existing?.company ?? "",
        phone: existing?.phone ?? "",
        email: existing?.email ?? "",
        address: existing?.address ?? "",
        preferred_contact: existing?.preferred_contact ?? "phone",
        notes: existing?.notes ?? "",
      });
      setDupes([]);
    }
  }, [open, existing, reset]);

  async function checkDupes() {
    const name = watch("name");
    if (!name) return;
    const found = await findDuplicateCustomers(
      { name, phone: watch("phone") ?? "", email: watch("email") ?? "" },
      existing?.id ?? null,
    );
    setDupes(found);
  }

  async function onSubmit(values: CustomerInput) {
    let id: number;
    if (existing) {
      await updateCustomer(existing.id, values);
      id = existing.id;
      toast.success("Customer updated");
    } else {
      id = await createCustomer(values);
      toast.success("Customer created");
    }
    onOpenChange(false);
    onSaved(id);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existing ? "Edit customer" : "New customer"}</DialogTitle>
          <DialogDescription>Duplicate detection runs on name, phone, and email.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input {...register("name")} onBlur={checkDupes} placeholder="Full name" />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>
          {dupes.length > 0 && (
            <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-2 text-xs text-warning">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                Possible duplicate{dupes.length > 1 ? "s" : ""}: {dupes.map((d) => d.name).join(", ")}
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Company</Label>
              <Input {...register("company")} />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input {...register("phone")} onBlur={checkDupes} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input {...register("email")} onBlur={checkDupes} />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Preferred contact</Label>
              <Select
                value={watch("preferred_contact")}
                onValueChange={(v) => setValue("preferred_contact", v as CustomerInput["preferred_contact"])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="phone">Phone</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="sms">SMS</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Address</Label>
            <Input {...register("address")} />
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea {...register("notes")} rows={3} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {existing ? "Save changes" : "Create customer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
