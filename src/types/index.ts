/**
 * Shared domain types. These mirror the SQLite schema (see schema.sql). Every
 * row type carries the standard id / created_at / updated_at / deleted_at
 * columns via the `BaseRow` mixin. No `any` is used anywhere in the codebase.
 */

export interface BaseRow {
  id: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// --- Enumerations (string unions) -------------------------------------------

export type TechRole = "owner" | "manager" | "technician" | "clerk";

export type ContactMethod = "phone" | "email" | "sms";

export type DeviceCategory =
  | "Smartphone"
  | "Tablet"
  | "Laptop"
  | "Desktop Motherboard"
  | "Game Console"
  | "TV"
  | "Other";

export type TicketType =
  | "Microsoldering"
  | "Component Repair"
  | "Diagnostic Only"
  | "Data Recovery"
  | "Cleaning"
  | "General Repair"
  | "Other";

export type TicketPriority = "Critical" | "High" | "Normal" | "Low";

export type TicketStatus =
  | "Intake"
  | "Diagnosed"
  | "Awaiting Parts"
  | "In Repair"
  | "QC"
  | "Awaiting Pickup"
  | "Completed"
  | "Closed"
  | "Unrepairable (BER)"
  | "Customer Declined"
  | "Warranty Return";

export type MeasurementKind =
  | "voltage"
  | "resistance"
  | "diode"
  | "thermal"
  | "scope"
  | "injection"
  | "microscope";

export type FaultState = "confirmed" | "suspected" | "ruled-out";

export type InvoiceStatus = "Draft" | "Sent" | "Paid" | "Partial" | "Void";

export type DonorCondition =
  | "Functional"
  | "Partially Functional"
  | "For Parts Only"
  | "Unknown";

export type ThemeMode = "dark" | "light" | "system";

// --- Core rows ---------------------------------------------------------------

export interface Technician extends BaseRow {
  name: string;
  email: string | null;
  role: TechRole;
  color: string;
  active: number;
  username: string | null;
  password_hash: string | null;
}

/** The authenticated user (no secrets). */
export interface AuthUser {
  id: number;
  name: string;
  username: string;
  role: TechRole;
}

export interface Customer extends BaseRow {
  name: string;
  company: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  preferred_contact: ContactMethod;
  notes: string | null;
  outstanding_cents: number;
  points_balance: number;
}

export interface RewardsLedgerEntry extends BaseRow {
  customer_id: number;
  sale_id: number | null;
  delta_points: number;
  balance_after: number;
  reason: string | null;
}

export interface CustomerTag extends BaseRow {
  customer_id: number;
  tag: string;
}

export interface CustomerCommunication extends BaseRow {
  customer_id: number;
  technician_id: number | null;
  channel: string;
  body: string;
}

export interface Device extends BaseRow {
  customer_id: number | null;
  category: DeviceCategory;
  brand: string;
  model: string;
  model_number: string | null;
  variant: string | null;
  serial_number: string | null;
  imei: string | null;
  asset_tag: string | null;
  notes: string | null;
  photo_path: string | null;
}

export interface ReferencePart extends BaseRow {
  category: string;
  brand: string | null;
  device_family: string | null;
  device_models: string | null;
  part_type: string;
  name: string;
  designator: string | null;
  manufacturer_pn: string | null;
  package: string | null;
  description: string | null;
}

export interface BoardRevision extends BaseRow {
  device_model: string;
  revision: string;
  layer_count: number | null;
  primary_soc: string | null;
  pmic: string | null;
  notes: string | null;
}

// --- Inventory ---------------------------------------------------------------

export interface InventoryLocation extends BaseRow {
  name: string;
  kind: string;
  notes: string | null;
}

export interface InventorySupplier extends BaseRow {
  name: string;
  website: string | null;
  contact: string | null;
  notes: string | null;
}

export interface InventoryItem extends BaseRow {
  sku: string | null;
  description: string;
  category: string;
  subcategory: string | null;
  package_type: string | null;
  value: string | null;
  package_size: string | null;
  location_id: number | null;
  quantity: number;
  low_stock_threshold: number;
  unit_cost_cents: number;
  sale_price_cents: number;
  is_consumable: number;
  consumable_unit: string | null;
  notes: string | null;
  model_number: string | null;
  serial_number: string | null;
}

export interface InventoryAuditEntry extends BaseRow {
  item_id: number;
  technician_id: number | null;
  action: string;
  qty_delta: number;
  qty_after: number;
  unit_cost_cents: number | null;
  reason: string | null;
  ticket_id: number | null;
}

// --- Tickets -----------------------------------------------------------------

export interface Ticket extends BaseRow {
  ticket_number: string;
  customer_id: number | null;
  device_id: number | null;
  technician_id: number | null;
  title: string;
  type: TicketType;
  priority: TicketPriority;
  status: TicketStatus;
  symptom_description: string | null;
  customer_notes: string | null;
  due_date: string | null;
  cosmetic_condition: string | null;
  accessories: string | null;
  password_provided: number;
  backup_acknowledged: number;
  consent_acknowledged: number;
  estimate_cents: number;
  actual_cost_cents: number;
  rework_count: number;
  reopened_reason: string | null;
  closed_at: string | null;
}

export interface TicketNote extends BaseRow {
  ticket_id: number;
  technician_id: number | null;
  body: string;
  internal: number;
}

export interface TicketTimelineEntry extends BaseRow {
  ticket_id: number;
  technician_id: number | null;
  event: string;
  from_status: string | null;
  to_status: string | null;
  detail: string | null;
}

export interface TicketAttachment extends BaseRow {
  ticket_id: number;
  category: string;
  original_name: string;
  relative_path: string;
  sha256: string | null;
  size_bytes: number;
  caption: string | null;
}

export interface TicketPart extends BaseRow {
  ticket_id: number;
  item_id: number | null;
  donor_component_id: number | null;
  description: string;
  quantity: number;
  unit_cost_cents: number;
  deducted: number;
}

export interface TicketLaborSession extends BaseRow {
  ticket_id: number;
  technician_id: number | null;
  started_at: string;
  ended_at: string | null;
  seconds: number;
  note: string | null;
}

export interface TicketTemplate extends BaseRow {
  name: string;
  config: string;
}

// --- Donor boards ------------------------------------------------------------

export interface DonorBoard extends BaseRow {
  brand: string;
  model: string;
  board_revision: string | null;
  condition: DonorCondition;
  source: string | null;
  purchase_cents: number;
  depleted: number;
  notes: string | null;
}

export interface DonorComponent extends BaseRow {
  donor_board_id: number;
  component_type: string;
  reference_designator: string | null;
  value: string | null;
  part_number: string | null;
  quantity: number;
  condition: string;
  used_ticket_id: number | null;
  inventory_item_id: number | null;
}

// --- Microsoldering -----------------------------------------------------------

export interface Measurement extends BaseRow {
  ticket_id: number | null;
  board_revision_id: number | null;
  technician_id: number | null;
  kind: MeasurementKind;
  test_point: string | null;
  reference_designator: string | null;
  rail_name: string | null;
  power_state: string | null;
  expected_value: string | null;
  measured_value: string | null;
  units: string | null;
  measurement_mode: string | null;
  orientation: string | null;
  signal_type: string | null;
  frequency: string | null;
  result: string | null;
  notes: string | null;
  image_path: string | null;
  is_known_good: number;
}

export interface FaultRecord extends BaseRow {
  ticket_id: number | null;
  device_model: string | null;
  board_revision_id: number | null;
  technician_id: number | null;
  category: string;
  state: FaultState;
  common_cause: string | null;
  reasoning: string | null;
  component_ref: string | null;
}

export interface RepairSolution extends BaseRow {
  fault_record_id: number | null;
  device_model: string | null;
  board_revision_id: number | null;
  fault_category: string | null;
  title: string;
  solution: string;
  success_count: number;
  fail_count: number;
}

// --- Knowledge base ----------------------------------------------------------

export interface KnowledgeArticle extends BaseRow {
  title: string;
  category: string | null;
  body_html: string;
  body_text: string;
  author_id: number | null;
}

export interface KnowledgeAttachment extends BaseRow {
  article_id: number;
  original_name: string;
  relative_path: string;
  kind: string;
  external_url: string | null;
  sha256: string | null;
  size_bytes: number;
}

// --- Financial ---------------------------------------------------------------

export interface FinancialTransaction extends BaseRow {
  kind: "revenue" | "expense";
  category: string | null;
  amount_cents: number;
  occurred_at: string;
  ticket_id: number | null;
  technician_id: number | null;
  device_category: string | null;
  notes: string | null;
  receipt_path: string | null;
}

export interface Invoice extends BaseRow {
  invoice_number: string;
  ticket_id: number | null;
  customer_id: number | null;
  status: InvoiceStatus;
  subtotal_cents: number;
  discount_cents: number;
  discount_is_percent: number;
  tax_rate_bp: number;
  tax_cents: number;
  total_cents: number;
  paid_cents: number;
  issued_at: string | null;
  due_at: string | null;
  notes: string | null;
}

export interface InvoiceLineItem extends BaseRow {
  invoice_id: number;
  kind: "labor" | "part" | "fee";
  description: string;
  quantity: number;
  unit_price_cents: number;
  line_total_cents: number;
}

// --- Platform ----------------------------------------------------------------

export interface ActivityEntry extends BaseRow {
  technician_id: number | null;
  entity_type: string;
  entity_id: number | null;
  action: string;
  summary: string;
}

export interface SavedFilter extends BaseRow {
  view: string;
  name: string;
  config: string;
}

export interface PluginRecord extends BaseRow {
  plugin_id: string;
  name: string;
  version: string;
  author: string | null;
  entry_point: string | null;
  permissions: string;
  enabled: number;
  manifest: string;
}

export interface BackupRecord extends BaseRow {
  path: string;
  size_bytes: number;
  file_count: number;
  kind: string;
}

// --- Native command payloads -------------------------------------------------

export interface StoredAttachment {
  relative_path: string;
  sha256: string;
  size: number;
  deduped: boolean;
}

export interface BackupCreateResult {
  path: string;
  size: number;
  file_count: number;
}

export interface PosSale extends BaseRow {
  sale_number: string;
  ticket_id: number | null;
  customer_id: number | null;
  subtotal_cents: number;
  discount_cents: number;
  tax_rate_bp: number;
  tax_cents: number;
  total_cents: number;
  payment_method: "card" | "terminal" | "cash" | "split";
  payment_status: "paid" | "pending" | "failed" | "refunded";
  square_payment_id: string | null;
  card_brand: string | null;
  last4: string | null;
  receipt_url: string | null;
  note: string | null;
}

export interface SquarePaymentResult {
  id: string;
  status: string;
  card_brand: string;
  last4: string;
  receipt_url: string;
  amount_cents: number;
}

export interface SquareTerminalResult {
  checkout_id: string;
  status: string;
  payment_id: string;
}

/** A single parameterised statement for the atomic `db_tx` command. */
export interface TxStatement {
  sql: string;
  params: SqlParam[];
}

/** Values accepted as SQL bind parameters. */
export type SqlParam = string | number | boolean | null;
