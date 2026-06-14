import type { BadgeProps } from "@/components/ui/badge";
import type { TicketPriority, TicketStatus, InvoiceStatus } from "@/types";

type BadgeVariant = NonNullable<BadgeProps["variant"]>;

/** Map a ticket status to a badge variant for consistent colour coding. */
export function statusVariant(status: TicketStatus): BadgeVariant {
  switch (status) {
    case "Completed":
    case "Closed":
      return "success";
    case "In Repair":
    case "QC":
    case "Diagnosed":
      return "default";
    case "Awaiting Parts":
    case "Awaiting Pickup":
      return "warning";
    case "Unrepairable (BER)":
    case "Customer Declined":
      return "destructive";
    case "Warranty Return":
      return "accent";
    default:
      return "secondary";
  }
}

/** Map a ticket priority to a badge variant. */
export function priorityVariant(priority: TicketPriority): BadgeVariant {
  switch (priority) {
    case "Critical":
      return "destructive";
    case "High":
      return "warning";
    case "Low":
      return "secondary";
    default:
      return "default";
  }
}

/** Map an invoice status to a badge variant. */
export function invoiceVariant(status: InvoiceStatus): BadgeVariant {
  switch (status) {
    case "Paid":
      return "success";
    case "Partial":
      return "warning";
    case "Void":
      return "destructive";
    case "Sent":
      return "default";
    default:
      return "secondary";
  }
}

/** The canonical forward status flow for the ticket Kanban board. */
export const TICKET_STATUS_FLOW: TicketStatus[] = [
  "Intake",
  "Diagnosed",
  "Awaiting Parts",
  "In Repair",
  "QC",
  "Awaiting Pickup",
  "Completed",
  "Closed",
];

export const TICKET_TERMINAL_STATUSES: TicketStatus[] = [
  "Unrepairable (BER)",
  "Customer Declined",
  "Warranty Return",
];
