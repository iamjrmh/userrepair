-- =============================================================================
-- userrepair - SQLite schema (migration v1)
--
-- Conventions (see RESEARCH.md section 4):
--   * Every table has  id INTEGER PRIMARY KEY AUTOINCREMENT,
--     created_at TEXT, updated_at TEXT  (ISO 8601 UTC).
--   * Money is stored as integer cents in *_cents columns. Never floats.
--   * Soft deletes via deleted_at TEXT. Reads filter  deleted_at IS NULL.
--   * Foreign keys are ON (set per-connection) and every FK is indexed.
--   * updated_at is maintained by AFTER UPDATE triggers (recursive triggers are
--     OFF by default in SQLite, so the trigger's own write does not re-fire).
--
-- Timestamp helper used throughout: strftime('%Y-%m-%dT%H:%M:%fZ','now').
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Technicians (shop staff)
-- -----------------------------------------------------------------------------
CREATE TABLE technicians (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,
  email        TEXT,
  role         TEXT NOT NULL DEFAULT 'technician', -- owner | manager | technician
  color        TEXT NOT NULL DEFAULT '#3B82F6',    -- avatar/label colour
  active       INTEGER NOT NULL DEFAULT 1,         -- 1 active, 0 deactivated
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at   TEXT
);

-- -----------------------------------------------------------------------------
-- Customers
-- -----------------------------------------------------------------------------
CREATE TABLE customers (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  name              TEXT NOT NULL,
  company           TEXT,
  phone             TEXT,
  email             TEXT,
  address           TEXT,
  preferred_contact TEXT NOT NULL DEFAULT 'phone', -- phone | email | sms
  notes             TEXT,                           -- rich text (HTML)
  outstanding_cents INTEGER NOT NULL DEFAULT 0,     -- denormalised balance cache
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at        TEXT
);

-- Customer tags (VIP, Wholesale, Warranty, Banned, ...). Many tags per customer.
CREATE TABLE customer_tags (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id  INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  tag          TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at   TEXT
);

-- Manual communication log entries ("Called customer, left voicemail").
CREATE TABLE customer_communications (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id  INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  technician_id INTEGER REFERENCES technicians(id),
  channel      TEXT NOT NULL DEFAULT 'phone', -- phone | email | sms | in-person
  body         TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at   TEXT
);

-- -----------------------------------------------------------------------------
-- Devices
-- -----------------------------------------------------------------------------
CREATE TABLE devices (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id   INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  category      TEXT NOT NULL DEFAULT 'Smartphone', -- Smartphone|Tablet|Laptop|Desktop Motherboard|Game Console|TV|Other
  brand         TEXT NOT NULL,
  model         TEXT NOT NULL,
  variant       TEXT,
  serial_number TEXT,
  imei          TEXT,                               -- validated with Luhn on the client
  asset_tag     TEXT,
  notes         TEXT,
  photo_path    TEXT,                               -- relative to app-data dir
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at    TEXT
);

-- -----------------------------------------------------------------------------
-- Board revisions (shared by Microsoldering + Board Tools modules)
-- -----------------------------------------------------------------------------
CREATE TABLE board_revisions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  device_model    TEXT NOT NULL,           -- "MacBook Pro 2019"
  revision        TEXT NOT NULL,           -- "820-01700"
  layer_count     INTEGER,
  primary_soc     TEXT,                    -- CPU/SoC
  pmic            TEXT,                    -- power management IC(s)
  notes           TEXT,                    -- board-specific quirks (rich text)
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at      TEXT
);

-- -----------------------------------------------------------------------------
-- Inventory: locations, suppliers, items, links, audit log
-- -----------------------------------------------------------------------------
CREATE TABLE inventory_locations (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,            -- "Shelf A2" / "Bin 14" / "Drawer 3"
  kind         TEXT NOT NULL DEFAULT 'shelf', -- shelf | bin | drawer | cabinet
  notes        TEXT,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at   TEXT
);

CREATE TABLE inventory_suppliers (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,
  website      TEXT,
  contact      TEXT,
  notes        TEXT,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at   TEXT
);

CREATE TABLE inventory_items (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  sku                 TEXT,
  description         TEXT NOT NULL,
  category            TEXT NOT NULL DEFAULT 'Other Component',
  subcategory         TEXT,
  package_type        TEXT,                 -- QFN | BGA | SOIC | SOT | ...
  value               TEXT,                 -- e.g. "10uF" / "4.7k"
  package_size        TEXT,                 -- e.g. "0402" / "0603"
  location_id         INTEGER REFERENCES inventory_locations(id) ON DELETE SET NULL,
  quantity            INTEGER NOT NULL DEFAULT 0,
  low_stock_threshold INTEGER NOT NULL DEFAULT 0,
  unit_cost_cents     INTEGER NOT NULL DEFAULT 0,
  sale_price_cents    INTEGER NOT NULL DEFAULT 0,
  is_consumable       INTEGER NOT NULL DEFAULT 0, -- flux/solder/IPA etc.
  consumable_unit     TEXT,                 -- "ml" | "g" | "roll" for consumables
  notes               TEXT,
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at          TEXT
);

-- Multiple suppliers per item (with supplier-specific part number + cost).
CREATE TABLE inventory_item_suppliers (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id              INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  supplier_id          INTEGER NOT NULL REFERENCES inventory_suppliers(id) ON DELETE CASCADE,
  supplier_part_number TEXT,
  unit_cost_cents      INTEGER NOT NULL DEFAULT 0,
  url                  TEXT,
  created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at           TEXT
);

-- Many-to-many: which device models an item is compatible with.
CREATE TABLE inventory_compatibility (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id      INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  device_model TEXT NOT NULL, -- free-form "iPhone 12" model string
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at   TEXT
);

-- Append-only audit log of every quantity / cost change.
CREATE TABLE inventory_audit_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id       INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  technician_id INTEGER REFERENCES technicians(id),
  action        TEXT NOT NULL,            -- receive | adjust | transfer | consume | writeoff
  qty_delta     INTEGER NOT NULL DEFAULT 0,
  qty_after     INTEGER NOT NULL DEFAULT 0,
  unit_cost_cents INTEGER,
  reason        TEXT,
  ticket_id     INTEGER REFERENCES tickets(id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at    TEXT
);

-- -----------------------------------------------------------------------------
-- Tickets and their children
-- -----------------------------------------------------------------------------
CREATE TABLE tickets (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_number       TEXT NOT NULL UNIQUE,        -- RS-YYYYMMDD-XXXX
  customer_id         INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  device_id           INTEGER REFERENCES devices(id) ON DELETE SET NULL,
  technician_id       INTEGER REFERENCES technicians(id) ON DELETE SET NULL,
  title               TEXT NOT NULL,
  type                TEXT NOT NULL DEFAULT 'General Repair',
  priority            TEXT NOT NULL DEFAULT 'Normal', -- Critical|High|Normal|Low
  status              TEXT NOT NULL DEFAULT 'Intake',
  symptom_description TEXT,                         -- rich text (HTML)
  customer_notes      TEXT,                         -- customer-facing (rich text)
  due_date            TEXT,                         -- ISO date
  -- Intake checklist
  cosmetic_condition  TEXT,
  accessories         TEXT,
  password_provided   INTEGER NOT NULL DEFAULT 0,
  backup_acknowledged INTEGER NOT NULL DEFAULT 0,
  consent_acknowledged INTEGER NOT NULL DEFAULT 0,
  -- Costing (integer cents)
  estimate_cents      INTEGER NOT NULL DEFAULT 0,
  actual_cost_cents   INTEGER NOT NULL DEFAULT 0,
  -- Rework tracking
  rework_count        INTEGER NOT NULL DEFAULT 0,
  reopened_reason     TEXT,
  closed_at           TEXT,
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at          TEXT
);

-- Internal (technician-only) and customer-facing notes both live here.
CREATE TABLE ticket_notes (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id     INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  technician_id INTEGER REFERENCES technicians(id),
  body          TEXT NOT NULL,           -- rich text (HTML)
  internal      INTEGER NOT NULL DEFAULT 1, -- 1 internal, 0 customer-facing
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at    TEXT
);

-- Timeline of status changes and notable events.
CREATE TABLE ticket_timeline (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id     INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  technician_id INTEGER REFERENCES technicians(id),
  event         TEXT NOT NULL,           -- status_change | note | part | invoice | ...
  from_status   TEXT,
  to_status     TEXT,
  detail        TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at    TEXT
);

-- Photo / file attachments on a ticket.
CREATE TABLE ticket_attachments (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id     INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  category      TEXT NOT NULL DEFAULT 'general', -- before | during | after | file | general
  original_name TEXT NOT NULL,
  relative_path TEXT NOT NULL,           -- under app-data dir
  sha256        TEXT,
  size_bytes    INTEGER NOT NULL DEFAULT 0,
  caption       TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at    TEXT
);

-- Estimate line items (labor or part).
CREATE TABLE ticket_estimate_items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id     INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL DEFAULT 'labor', -- labor | part
  description   TEXT NOT NULL,
  quantity      INTEGER NOT NULL DEFAULT 1,
  unit_price_cents INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at    TEXT
);

-- Parts consumed by a ticket (auto-deducts from inventory on confirmation).
CREATE TABLE ticket_parts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id     INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  item_id       INTEGER REFERENCES inventory_items(id) ON DELETE SET NULL,
  donor_component_id INTEGER REFERENCES donor_components(id) ON DELETE SET NULL,
  description   TEXT NOT NULL,
  quantity      INTEGER NOT NULL DEFAULT 1,
  unit_cost_cents INTEGER NOT NULL DEFAULT 0,
  deducted      INTEGER NOT NULL DEFAULT 0, -- 1 once stock has been deducted
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at    TEXT
);

-- Labor time tracker (start/stop sessions per technician).
CREATE TABLE ticket_labor_sessions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id     INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  technician_id INTEGER REFERENCES technicians(id),
  started_at    TEXT NOT NULL,
  ended_at      TEXT,
  seconds       INTEGER NOT NULL DEFAULT 0,
  note          TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at    TEXT
);

-- Reusable ticket templates ("iPhone BGA Reball", ...). config is JSON.
CREATE TABLE ticket_templates (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  config        TEXT NOT NULL DEFAULT '{}', -- JSON snapshot of ticket fields
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at    TEXT
);

-- -----------------------------------------------------------------------------
-- Donor boards and harvested components
-- -----------------------------------------------------------------------------
CREATE TABLE donor_boards (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  brand            TEXT NOT NULL,
  model            TEXT NOT NULL,
  board_revision   TEXT,
  condition        TEXT NOT NULL DEFAULT 'Unknown', -- Functional|Partially Functional|For Parts Only|Unknown
  source           TEXT,
  purchase_cents   INTEGER NOT NULL DEFAULT 0,
  depleted         INTEGER NOT NULL DEFAULT 0,
  notes            TEXT,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at       TEXT
);

CREATE TABLE donor_components (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  donor_board_id   INTEGER NOT NULL REFERENCES donor_boards(id) ON DELETE CASCADE,
  component_type   TEXT NOT NULL,          -- IC | MOSFET | Connector | Capacitor | ...
  reference_designator TEXT,               -- U2, Q3, J1
  value            TEXT,
  part_number      TEXT,
  quantity         INTEGER NOT NULL DEFAULT 1,
  condition        TEXT NOT NULL DEFAULT 'untested', -- tested good | untested | known good
  used_ticket_id   INTEGER REFERENCES tickets(id) ON DELETE SET NULL,
  inventory_item_id INTEGER REFERENCES inventory_items(id) ON DELETE SET NULL,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at       TEXT
);

-- -----------------------------------------------------------------------------
-- Microsoldering: measurements, faults, known-good, procedures
-- -----------------------------------------------------------------------------
CREATE TABLE measurements (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id         INTEGER REFERENCES tickets(id) ON DELETE CASCADE,
  board_revision_id INTEGER REFERENCES board_revisions(id) ON DELETE SET NULL,
  technician_id     INTEGER REFERENCES technicians(id),
  kind              TEXT NOT NULL,         -- voltage|resistance|diode|thermal|scope|injection|microscope
  test_point        TEXT,
  reference_designator TEXT,
  rail_name         TEXT,                  -- voltage: PP3V3_SUS etc.
  power_state       TEXT,                  -- off | standby | on
  -- Generic expected/measured (numeric stored as TEXT to keep units flexible)
  expected_value    TEXT,
  measured_value    TEXT,
  units             TEXT,                  -- mV|V|Ohm|kOhm|MOhm|degC|Hz|...
  measurement_mode  TEXT,                  -- resistance: to-ground | between-points
  orientation       TEXT,                  -- diode: anode/cathode note
  signal_type       TEXT,                  -- scope: clock|PWM|I2C|SPI|...
  frequency         TEXT,                  -- scope/injection
  result            TEXT,                  -- injection: responded|no response|damaged
  notes             TEXT,                  -- rich text
  image_path        TEXT,                  -- relative to app-data dir
  is_known_good     INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at        TEXT
);

CREATE TABLE fault_records (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id         INTEGER REFERENCES tickets(id) ON DELETE SET NULL,
  device_model      TEXT,
  board_revision_id INTEGER REFERENCES board_revisions(id) ON DELETE SET NULL,
  technician_id     INTEGER REFERENCES technicians(id),
  category          TEXT NOT NULL,         -- No Power | No Backlight | ...
  state             TEXT NOT NULL DEFAULT 'suspected', -- confirmed | suspected | ruled-out
  common_cause      TEXT,
  reasoning         TEXT,                  -- chain of reasoning (rich text)
  component_ref     TEXT,                  -- failing component reference
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at        TEXT
);

-- Confirmed working repair procedures / solutions (Repair Intelligence).
CREATE TABLE repair_solutions (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  fault_record_id   INTEGER REFERENCES fault_records(id) ON DELETE SET NULL,
  device_model      TEXT,
  board_revision_id INTEGER REFERENCES board_revisions(id) ON DELETE SET NULL,
  fault_category    TEXT,
  title             TEXT NOT NULL,
  solution          TEXT NOT NULL,         -- rich text
  success_count     INTEGER NOT NULL DEFAULT 0,
  fail_count        INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at        TEXT
);

-- Step-by-step repair procedures per board revision per fault type.
CREATE TABLE repair_procedures (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  board_revision_id INTEGER REFERENCES board_revisions(id) ON DELETE CASCADE,
  fault_category    TEXT,
  title             TEXT NOT NULL,
  steps             TEXT NOT NULL DEFAULT '[]', -- JSON ordered steps
  success_count     INTEGER NOT NULL DEFAULT 0,
  fail_count        INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at        TEXT
);

-- -----------------------------------------------------------------------------
-- Board-level tools: nets, test points, component index, layer images
-- -----------------------------------------------------------------------------
CREATE TABLE board_nets (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  board_revision_id INTEGER NOT NULL REFERENCES board_revisions(id) ON DELETE CASCADE,
  net_name          TEXT NOT NULL,
  test_point        TEXT,
  expected_value    TEXT,
  units             TEXT,
  notes             TEXT,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at        TEXT
);

CREATE TABLE board_test_points (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  board_revision_id INTEGER NOT NULL REFERENCES board_revisions(id) ON DELETE CASCADE,
  label             TEXT NOT NULL,
  location_desc     TEXT,
  expected_voltage  TEXT,
  expected_resistance TEXT,
  notes             TEXT,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at        TEXT
);

CREATE TABLE board_components (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  board_revision_id INTEGER NOT NULL REFERENCES board_revisions(id) ON DELETE CASCADE,
  reference_designator TEXT NOT NULL,      -- U1, Q3, C12, ...
  component_type    TEXT,
  value             TEXT,
  part_number       TEXT,
  notes             TEXT,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at        TEXT
);

CREATE TABLE board_layer_images (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  board_revision_id INTEGER NOT NULL REFERENCES board_revisions(id) ON DELETE CASCADE,
  layer_label       TEXT NOT NULL,         -- "Top" / "L2" / "Bottom"
  relative_path     TEXT NOT NULL,
  notes             TEXT,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at        TEXT
);

-- Board revision file attachments (boardview / schematic PDFs).
CREATE TABLE board_attachments (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  board_revision_id INTEGER NOT NULL REFERENCES board_revisions(id) ON DELETE CASCADE,
  original_name     TEXT NOT NULL,
  relative_path     TEXT NOT NULL,
  kind              TEXT NOT NULL DEFAULT 'file', -- boardview | schematic | image | file
  sha256            TEXT,
  size_bytes        INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at        TEXT
);

-- -----------------------------------------------------------------------------
-- Knowledge base
-- -----------------------------------------------------------------------------
CREATE TABLE knowledge_articles (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  title         TEXT NOT NULL,
  category      TEXT,                      -- hierarchical path "Repair Guides/MacBook/No Power"
  body_html     TEXT NOT NULL DEFAULT '',  -- TipTap HTML
  body_text     TEXT NOT NULL DEFAULT '',  -- plain text mirror for FTS
  author_id     INTEGER REFERENCES technicians(id),
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at    TEXT
);

CREATE TABLE knowledge_tags (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id    INTEGER NOT NULL REFERENCES knowledge_articles(id) ON DELETE CASCADE,
  tag           TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at    TEXT
);

CREATE TABLE knowledge_attachments (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id    INTEGER NOT NULL REFERENCES knowledge_articles(id) ON DELETE CASCADE,
  original_name TEXT NOT NULL,
  relative_path TEXT NOT NULL,
  kind          TEXT NOT NULL DEFAULT 'file', -- pdf | image | video | boardview | bios | zip | file
  external_url  TEXT,                      -- for video links
  sha256        TEXT,
  size_bytes    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at    TEXT
);

-- Wiki-style [[Article Title]] links between articles (for backlinks).
CREATE TABLE knowledge_links (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  from_article_id INTEGER NOT NULL REFERENCES knowledge_articles(id) ON DELETE CASCADE,
  to_title      TEXT NOT NULL,             -- resolved by title
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at    TEXT
);

-- Version history snapshots for articles (diff is computed in the UI).
CREATE TABLE knowledge_article_versions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id    INTEGER NOT NULL REFERENCES knowledge_articles(id) ON DELETE CASCADE,
  technician_id INTEGER REFERENCES technicians(id),
  title         TEXT NOT NULL,
  body_html     TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at    TEXT
);

-- -----------------------------------------------------------------------------
-- Financial: transactions, invoices, line items
-- -----------------------------------------------------------------------------
CREATE TABLE financial_transactions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  kind          TEXT NOT NULL,             -- revenue | expense
  category      TEXT,                      -- parts|tools|supplies|rent|software|other / repair-type
  amount_cents  INTEGER NOT NULL DEFAULT 0,
  occurred_at   TEXT NOT NULL,             -- ISO date
  ticket_id     INTEGER REFERENCES tickets(id) ON DELETE SET NULL,
  technician_id INTEGER REFERENCES technicians(id),
  device_category TEXT,
  notes         TEXT,
  receipt_path  TEXT,                      -- relative path for expense receipts
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at    TEXT
);

CREATE TABLE invoices (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_number    TEXT NOT NULL UNIQUE,
  ticket_id         INTEGER REFERENCES tickets(id) ON DELETE SET NULL,
  customer_id       INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  status            TEXT NOT NULL DEFAULT 'Draft', -- Draft|Sent|Paid|Partial|Void
  subtotal_cents    INTEGER NOT NULL DEFAULT 0,
  discount_cents    INTEGER NOT NULL DEFAULT 0,
  discount_is_percent INTEGER NOT NULL DEFAULT 0,
  tax_rate_bp       INTEGER NOT NULL DEFAULT 0,  -- tax rate in basis points (e.g. 825 = 8.25%)
  tax_cents         INTEGER NOT NULL DEFAULT 0,
  total_cents       INTEGER NOT NULL DEFAULT 0,
  paid_cents        INTEGER NOT NULL DEFAULT 0,
  issued_at         TEXT,
  due_at            TEXT,
  notes             TEXT,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at        TEXT
);

CREATE TABLE invoice_line_items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id    INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL DEFAULT 'labor', -- labor | part | fee
  description   TEXT NOT NULL,
  quantity      INTEGER NOT NULL DEFAULT 1,
  unit_price_cents INTEGER NOT NULL DEFAULT 0,
  line_total_cents INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at    TEXT
);

-- -----------------------------------------------------------------------------
-- Platform: activity log, settings, saved filters, plugins, backups
-- -----------------------------------------------------------------------------
CREATE TABLE activity_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  technician_id INTEGER REFERENCES technicians(id),
  entity_type   TEXT NOT NULL,            -- ticket | customer | inventory | ...
  entity_id     INTEGER,
  action        TEXT NOT NULL,            -- created | updated | deleted | status | ...
  summary       TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at    TEXT
);

-- Single-row-per-key settings store.
CREATE TABLE app_settings (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  key           TEXT NOT NULL UNIQUE,
  value         TEXT NOT NULL,            -- JSON-encoded value
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at    TEXT
);

CREATE TABLE saved_filters (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  view          TEXT NOT NULL,            -- "tickets" | "inventory" | ...
  name          TEXT NOT NULL,
  config        TEXT NOT NULL DEFAULT '{}', -- JSON filter config
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at    TEXT
);

CREATE TABLE plugin_registry (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  plugin_id     TEXT NOT NULL UNIQUE,     -- from plugin.json name
  name          TEXT NOT NULL,
  version       TEXT NOT NULL,
  author        TEXT,
  entry_point   TEXT,
  permissions   TEXT NOT NULL DEFAULT '[]', -- JSON array
  enabled       INTEGER NOT NULL DEFAULT 0,
  manifest      TEXT NOT NULL DEFAULT '{}', -- full plugin.json
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at    TEXT
);

CREATE TABLE backup_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  path          TEXT NOT NULL,
  size_bytes    INTEGER NOT NULL DEFAULT 0,
  file_count    INTEGER NOT NULL DEFAULT 0,
  kind          TEXT NOT NULL DEFAULT 'manual', -- manual | scheduled
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at    TEXT
);

-- =============================================================================
-- Indexes on foreign keys and frequently queried columns
-- =============================================================================
CREATE INDEX idx_customer_tags_customer ON customer_tags(customer_id);
CREATE INDEX idx_customer_comms_customer ON customer_communications(customer_id);
CREATE INDEX idx_devices_customer ON devices(customer_id);
CREATE INDEX idx_devices_model ON devices(brand, model);
CREATE INDEX idx_inv_items_location ON inventory_items(location_id);
CREATE INDEX idx_inv_items_category ON inventory_items(category);
CREATE INDEX idx_inv_item_suppliers_item ON inventory_item_suppliers(item_id);
CREATE INDEX idx_inv_item_suppliers_supplier ON inventory_item_suppliers(supplier_id);
CREATE INDEX idx_inv_compat_item ON inventory_compatibility(item_id);
CREATE INDEX idx_inv_audit_item ON inventory_audit_log(item_id);
CREATE INDEX idx_inv_audit_ticket ON inventory_audit_log(ticket_id);
CREATE INDEX idx_tickets_customer ON tickets(customer_id);
CREATE INDEX idx_tickets_device ON tickets(device_id);
CREATE INDEX idx_tickets_tech ON tickets(technician_id);
CREATE INDEX idx_tickets_status ON tickets(status);
CREATE INDEX idx_tickets_due ON tickets(due_date);
CREATE INDEX idx_ticket_notes_ticket ON ticket_notes(ticket_id);
CREATE INDEX idx_ticket_timeline_ticket ON ticket_timeline(ticket_id);
CREATE INDEX idx_ticket_attach_ticket ON ticket_attachments(ticket_id);
CREATE INDEX idx_ticket_estimate_ticket ON ticket_estimate_items(ticket_id);
CREATE INDEX idx_ticket_parts_ticket ON ticket_parts(ticket_id);
CREATE INDEX idx_ticket_parts_item ON ticket_parts(item_id);
CREATE INDEX idx_ticket_labor_ticket ON ticket_labor_sessions(ticket_id);
CREATE INDEX idx_donor_components_board ON donor_components(donor_board_id);
CREATE INDEX idx_donor_components_ticket ON donor_components(used_ticket_id);
CREATE INDEX idx_measurements_ticket ON measurements(ticket_id);
CREATE INDEX idx_measurements_board ON measurements(board_revision_id);
CREATE INDEX idx_measurements_kind ON measurements(kind);
CREATE INDEX idx_fault_ticket ON fault_records(ticket_id);
CREATE INDEX idx_fault_board ON fault_records(board_revision_id);
CREATE INDEX idx_fault_category ON fault_records(category);
CREATE INDEX idx_solutions_board ON repair_solutions(board_revision_id);
CREATE INDEX idx_procedures_board ON repair_procedures(board_revision_id);
CREATE INDEX idx_board_nets_board ON board_nets(board_revision_id);
CREATE INDEX idx_board_tp_board ON board_test_points(board_revision_id);
CREATE INDEX idx_board_comp_board ON board_components(board_revision_id);
CREATE INDEX idx_board_layer_board ON board_layer_images(board_revision_id);
CREATE INDEX idx_board_attach_board ON board_attachments(board_revision_id);
CREATE INDEX idx_knowledge_tags_article ON knowledge_tags(article_id);
CREATE INDEX idx_knowledge_attach_article ON knowledge_attachments(article_id);
CREATE INDEX idx_knowledge_links_from ON knowledge_links(from_article_id);
CREATE INDEX idx_knowledge_links_to ON knowledge_links(to_title);
CREATE INDEX idx_knowledge_versions_article ON knowledge_article_versions(article_id);
CREATE INDEX idx_fin_tx_kind ON financial_transactions(kind);
CREATE INDEX idx_fin_tx_occurred ON financial_transactions(occurred_at);
CREATE INDEX idx_fin_tx_ticket ON financial_transactions(ticket_id);
CREATE INDEX idx_invoices_ticket ON invoices(ticket_id);
CREATE INDEX idx_invoices_customer ON invoices(customer_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoice_items_invoice ON invoice_line_items(invoice_id);
CREATE INDEX idx_activity_entity ON activity_log(entity_type, entity_id);
CREATE INDEX idx_activity_created ON activity_log(created_at);
CREATE INDEX idx_saved_filters_view ON saved_filters(view);

-- =============================================================================
-- updated_at triggers (one per table). Recursive triggers are OFF by default,
-- so the trigger's own UPDATE does not re-fire it.
-- =============================================================================
CREATE TRIGGER trg_technicians_upd AFTER UPDATE ON technicians FOR EACH ROW BEGIN UPDATE technicians SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;
CREATE TRIGGER trg_customers_upd AFTER UPDATE ON customers FOR EACH ROW BEGIN UPDATE customers SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;
CREATE TRIGGER trg_customer_tags_upd AFTER UPDATE ON customer_tags FOR EACH ROW BEGIN UPDATE customer_tags SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;
CREATE TRIGGER trg_customer_comms_upd AFTER UPDATE ON customer_communications FOR EACH ROW BEGIN UPDATE customer_communications SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;
CREATE TRIGGER trg_devices_upd AFTER UPDATE ON devices FOR EACH ROW BEGIN UPDATE devices SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;
CREATE TRIGGER trg_board_revisions_upd AFTER UPDATE ON board_revisions FOR EACH ROW BEGIN UPDATE board_revisions SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;
CREATE TRIGGER trg_inv_locations_upd AFTER UPDATE ON inventory_locations FOR EACH ROW BEGIN UPDATE inventory_locations SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;
CREATE TRIGGER trg_inv_suppliers_upd AFTER UPDATE ON inventory_suppliers FOR EACH ROW BEGIN UPDATE inventory_suppliers SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;
CREATE TRIGGER trg_inv_items_upd AFTER UPDATE ON inventory_items FOR EACH ROW BEGIN UPDATE inventory_items SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;
CREATE TRIGGER trg_inv_item_suppliers_upd AFTER UPDATE ON inventory_item_suppliers FOR EACH ROW BEGIN UPDATE inventory_item_suppliers SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;
CREATE TRIGGER trg_inv_compat_upd AFTER UPDATE ON inventory_compatibility FOR EACH ROW BEGIN UPDATE inventory_compatibility SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;
CREATE TRIGGER trg_tickets_upd AFTER UPDATE ON tickets FOR EACH ROW BEGIN UPDATE tickets SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;
CREATE TRIGGER trg_ticket_notes_upd AFTER UPDATE ON ticket_notes FOR EACH ROW BEGIN UPDATE ticket_notes SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;
CREATE TRIGGER trg_ticket_estimate_upd AFTER UPDATE ON ticket_estimate_items FOR EACH ROW BEGIN UPDATE ticket_estimate_items SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;
CREATE TRIGGER trg_ticket_parts_upd AFTER UPDATE ON ticket_parts FOR EACH ROW BEGIN UPDATE ticket_parts SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;
CREATE TRIGGER trg_ticket_labor_upd AFTER UPDATE ON ticket_labor_sessions FOR EACH ROW BEGIN UPDATE ticket_labor_sessions SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;
CREATE TRIGGER trg_ticket_templates_upd AFTER UPDATE ON ticket_templates FOR EACH ROW BEGIN UPDATE ticket_templates SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;
CREATE TRIGGER trg_donor_boards_upd AFTER UPDATE ON donor_boards FOR EACH ROW BEGIN UPDATE donor_boards SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;
CREATE TRIGGER trg_donor_components_upd AFTER UPDATE ON donor_components FOR EACH ROW BEGIN UPDATE donor_components SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;
CREATE TRIGGER trg_measurements_upd AFTER UPDATE ON measurements FOR EACH ROW BEGIN UPDATE measurements SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;
CREATE TRIGGER trg_fault_records_upd AFTER UPDATE ON fault_records FOR EACH ROW BEGIN UPDATE fault_records SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;
CREATE TRIGGER trg_repair_solutions_upd AFTER UPDATE ON repair_solutions FOR EACH ROW BEGIN UPDATE repair_solutions SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;
CREATE TRIGGER trg_repair_procedures_upd AFTER UPDATE ON repair_procedures FOR EACH ROW BEGIN UPDATE repair_procedures SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;
CREATE TRIGGER trg_board_nets_upd AFTER UPDATE ON board_nets FOR EACH ROW BEGIN UPDATE board_nets SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;
CREATE TRIGGER trg_board_tp_upd AFTER UPDATE ON board_test_points FOR EACH ROW BEGIN UPDATE board_test_points SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;
CREATE TRIGGER trg_board_comp_upd AFTER UPDATE ON board_components FOR EACH ROW BEGIN UPDATE board_components SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;
CREATE TRIGGER trg_board_layer_upd AFTER UPDATE ON board_layer_images FOR EACH ROW BEGIN UPDATE board_layer_images SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;
CREATE TRIGGER trg_board_attach_upd AFTER UPDATE ON board_attachments FOR EACH ROW BEGIN UPDATE board_attachments SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;
CREATE TRIGGER trg_knowledge_articles_upd AFTER UPDATE ON knowledge_articles FOR EACH ROW BEGIN UPDATE knowledge_articles SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;
CREATE TRIGGER trg_knowledge_tags_upd AFTER UPDATE ON knowledge_tags FOR EACH ROW BEGIN UPDATE knowledge_tags SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;
CREATE TRIGGER trg_knowledge_attach_upd AFTER UPDATE ON knowledge_attachments FOR EACH ROW BEGIN UPDATE knowledge_attachments SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;
CREATE TRIGGER trg_knowledge_versions_upd AFTER UPDATE ON knowledge_article_versions FOR EACH ROW BEGIN UPDATE knowledge_article_versions SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;
CREATE TRIGGER trg_fin_tx_upd AFTER UPDATE ON financial_transactions FOR EACH ROW BEGIN UPDATE financial_transactions SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;
CREATE TRIGGER trg_invoices_upd AFTER UPDATE ON invoices FOR EACH ROW BEGIN UPDATE invoices SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;
CREATE TRIGGER trg_invoice_items_upd AFTER UPDATE ON invoice_line_items FOR EACH ROW BEGIN UPDATE invoice_line_items SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;
CREATE TRIGGER trg_app_settings_upd AFTER UPDATE ON app_settings FOR EACH ROW BEGIN UPDATE app_settings SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;
CREATE TRIGGER trg_saved_filters_upd AFTER UPDATE ON saved_filters FOR EACH ROW BEGIN UPDATE saved_filters SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;
CREATE TRIGGER trg_plugin_registry_upd AFTER UPDATE ON plugin_registry FOR EACH ROW BEGIN UPDATE plugin_registry SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;

-- =============================================================================
-- FTS5 full-text search (external-content tables kept in sync via triggers)
-- =============================================================================
CREATE VIRTUAL TABLE fts_tickets USING fts5(
  ticket_number, title, symptom, customer_notes,
  content='tickets', content_rowid='id'
);
CREATE TRIGGER fts_tickets_ai AFTER INSERT ON tickets BEGIN
  INSERT INTO fts_tickets(rowid, ticket_number, title, symptom, customer_notes)
  VALUES (new.id, new.ticket_number, new.title, new.symptom_description, new.customer_notes);
END;
CREATE TRIGGER fts_tickets_ad AFTER DELETE ON tickets BEGIN
  INSERT INTO fts_tickets(fts_tickets, rowid, ticket_number, title, symptom, customer_notes)
  VALUES ('delete', old.id, old.ticket_number, old.title, old.symptom_description, old.customer_notes);
END;
CREATE TRIGGER fts_tickets_au AFTER UPDATE ON tickets BEGIN
  INSERT INTO fts_tickets(fts_tickets, rowid, ticket_number, title, symptom, customer_notes)
  VALUES ('delete', old.id, old.ticket_number, old.title, old.symptom_description, old.customer_notes);
  INSERT INTO fts_tickets(rowid, ticket_number, title, symptom, customer_notes)
  VALUES (new.id, new.ticket_number, new.title, new.symptom_description, new.customer_notes);
END;

CREATE VIRTUAL TABLE fts_customers USING fts5(
  name, company, phone, email, notes,
  content='customers', content_rowid='id'
);
CREATE TRIGGER fts_customers_ai AFTER INSERT ON customers BEGIN
  INSERT INTO fts_customers(rowid, name, company, phone, email, notes)
  VALUES (new.id, new.name, new.company, new.phone, new.email, new.notes);
END;
CREATE TRIGGER fts_customers_ad AFTER DELETE ON customers BEGIN
  INSERT INTO fts_customers(fts_customers, rowid, name, company, phone, email, notes)
  VALUES ('delete', old.id, old.name, old.company, old.phone, old.email, old.notes);
END;
CREATE TRIGGER fts_customers_au AFTER UPDATE ON customers BEGIN
  INSERT INTO fts_customers(fts_customers, rowid, name, company, phone, email, notes)
  VALUES ('delete', old.id, old.name, old.company, old.phone, old.email, old.notes);
  INSERT INTO fts_customers(rowid, name, company, phone, email, notes)
  VALUES (new.id, new.name, new.company, new.phone, new.email, new.notes);
END;

CREATE VIRTUAL TABLE fts_knowledge USING fts5(
  title, body, category,
  content='knowledge_articles', content_rowid='id'
);
CREATE TRIGGER fts_knowledge_ai AFTER INSERT ON knowledge_articles BEGIN
  INSERT INTO fts_knowledge(rowid, title, body, category)
  VALUES (new.id, new.title, new.body_text, new.category);
END;
CREATE TRIGGER fts_knowledge_ad AFTER DELETE ON knowledge_articles BEGIN
  INSERT INTO fts_knowledge(fts_knowledge, rowid, title, body, category)
  VALUES ('delete', old.id, old.title, old.body_text, old.category);
END;
CREATE TRIGGER fts_knowledge_au AFTER UPDATE ON knowledge_articles BEGIN
  INSERT INTO fts_knowledge(fts_knowledge, rowid, title, body, category)
  VALUES ('delete', old.id, old.title, old.body_text, old.category);
  INSERT INTO fts_knowledge(rowid, title, body, category)
  VALUES (new.id, new.title, new.body_text, new.category);
END;

CREATE VIRTUAL TABLE fts_measurements USING fts5(
  test_point, reference_designator, rail_name, notes,
  content='measurements', content_rowid='id'
);
CREATE TRIGGER fts_measurements_ai AFTER INSERT ON measurements BEGIN
  INSERT INTO fts_measurements(rowid, test_point, reference_designator, rail_name, notes)
  VALUES (new.id, new.test_point, new.reference_designator, new.rail_name, new.notes);
END;
CREATE TRIGGER fts_measurements_ad AFTER DELETE ON measurements BEGIN
  INSERT INTO fts_measurements(fts_measurements, rowid, test_point, reference_designator, rail_name, notes)
  VALUES ('delete', old.id, old.test_point, old.reference_designator, old.rail_name, old.notes);
END;
CREATE TRIGGER fts_measurements_au AFTER UPDATE ON measurements BEGIN
  INSERT INTO fts_measurements(fts_measurements, rowid, test_point, reference_designator, rail_name, notes)
  VALUES ('delete', old.id, old.test_point, old.reference_designator, old.rail_name, old.notes);
  INSERT INTO fts_measurements(rowid, test_point, reference_designator, rail_name, notes)
  VALUES (new.id, new.test_point, new.reference_designator, new.rail_name, new.notes);
END;

CREATE VIRTUAL TABLE fts_inventory USING fts5(
  sku, description, value, notes,
  content='inventory_items', content_rowid='id'
);
CREATE TRIGGER fts_inventory_ai AFTER INSERT ON inventory_items BEGIN
  INSERT INTO fts_inventory(rowid, sku, description, value, notes)
  VALUES (new.id, new.sku, new.description, new.value, new.notes);
END;
CREATE TRIGGER fts_inventory_ad AFTER DELETE ON inventory_items BEGIN
  INSERT INTO fts_inventory(fts_inventory, rowid, sku, description, value, notes)
  VALUES ('delete', old.id, old.sku, old.description, old.value, old.notes);
END;
CREATE TRIGGER fts_inventory_au AFTER UPDATE ON inventory_items BEGIN
  INSERT INTO fts_inventory(fts_inventory, rowid, sku, description, value, notes)
  VALUES ('delete', old.id, old.sku, old.description, old.value, old.notes);
  INSERT INTO fts_inventory(rowid, sku, description, value, notes)
  VALUES (new.id, new.sku, new.description, new.value, new.notes);
END;

-- =============================================================================
-- Seed: baseline settings only. The first owner account is created by the
-- first-run setup wizard, not seeded here.
-- =============================================================================
INSERT INTO app_settings (key, value) VALUES
  ('shop.name', '""'),
  ('shop.address', '""'),
  ('shop.phone', '""'),
  ('shop.email', '""'),
  ('shop.logo_path', '""'),
  ('finance.tax_rate_bp', '0'),
  ('finance.currency', '"USD"'),
  ('tickets.prefix', '"RS"'),
  ('tickets.default_priority', '"Normal"'),
  ('tickets.default_status', '"Intake"'),
  ('inventory.default_low_stock', '3'),
  ('theme.mode', '"dark"'),
  ('backup.schedule', '"manual"'),
  ('backup.path', '""');
