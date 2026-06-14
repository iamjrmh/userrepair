import { z } from "zod";
import { isValidImei } from "@/lib/format";

/** Shared Zod schemas. Forms validate with these before hitting the DB layer. */

export const customerSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  company: z.string().trim().optional().default(""),
  phone: z.string().trim().optional().default(""),
  email: z.string().trim().email("Invalid email").optional().or(z.literal("")),
  address: z.string().trim().optional().default(""),
  preferred_contact: z.enum(["phone", "email", "sms"]).default("phone"),
  notes: z.string().optional().default(""),
});
export type CustomerInput = z.infer<typeof customerSchema>;
export type CustomerFormValues = z.input<typeof customerSchema>;

export const deviceSchema = z
  .object({
    customer_id: z.number().nullable().default(null),
    category: z.enum([
      "Smartphone",
      "Tablet",
      "Laptop",
      "Desktop Motherboard",
      "Game Console",
      "TV",
      "Other",
    ]),
    brand: z.string().trim().min(1, "Brand is required"),
    model: z.string().trim().min(1, "Model is required"),
    model_number: z.string().trim().optional().default(""),
    variant: z.string().trim().optional().default(""),
    serial_number: z.string().trim().optional().default(""),
    imei: z.string().trim().optional().default(""),
    asset_tag: z.string().trim().optional().default(""),
    notes: z.string().optional().default(""),
  })
  .refine((d) => d.imei === "" || isValidImei(d.imei), {
    message: "IMEI fails the Luhn check",
    path: ["imei"],
  });
export type DeviceInput = z.infer<typeof deviceSchema>;
export type DeviceFormValues = z.input<typeof deviceSchema>;

export const inventoryItemSchema = z.object({
  sku: z.string().trim().optional().default(""),
  description: z.string().trim().min(1, "Description is required"),
  category: z.string().trim().min(1, "Category is required"),
  subcategory: z.string().trim().optional().default(""),
  package_type: z.string().trim().optional().default(""),
  value: z.string().trim().optional().default(""),
  package_size: z.string().trim().optional().default(""),
  location_id: z.number().nullable().default(null),
  quantity: z.number().int().min(0).default(0),
  low_stock_threshold: z.number().int().min(0).default(0),
  unit_cost_cents: z.number().int().min(0).default(0),
  sale_price_cents: z.number().int().min(0).default(0),
  is_consumable: z.boolean().default(false),
  consumable_unit: z.string().trim().optional().default(""),
  notes: z.string().optional().default(""),
  model_number: z.string().trim().optional().default(""),
  serial_number: z.string().trim().optional().default(""),
});
export type InventoryItemInput = z.infer<typeof inventoryItemSchema>;

export const ticketSchema = z.object({
  // A customer account is required to check a device in, so any later return can
  // be tied to the purchaser (receipt or account).
  customer_id: z
    .number({ message: "Select a customer to check in the device" })
    .nullable()
    .refine((v) => v !== null, { message: "Select a customer to check in the device" }),
  device_id: z.number().nullable().default(null),
  technician_id: z.number().nullable().default(null),
  title: z.string().trim().min(1, "Title is required"),
  type: z.enum([
    "Microsoldering",
    "Component Repair",
    "Diagnostic Only",
    "Data Recovery",
    "Cleaning",
    "General Repair",
    "Other",
  ]),
  priority: z.enum(["Critical", "High", "Normal", "Low"]).default("Normal"),
  due_date: z.string().optional().default(""),
  symptom_description: z.string().optional().default(""),
});
export type TicketInput = z.infer<typeof ticketSchema>;
export type TicketFormValues = z.input<typeof ticketSchema>;
