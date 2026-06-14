-- Migration v11: Point of Sale (POS) tables and Square configuration settings.

CREATE TABLE pos_sales (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_number       TEXT NOT NULL UNIQUE,        -- POS-NNNNN
  ticket_id         INTEGER REFERENCES tickets(id) ON DELETE SET NULL,
  customer_id       INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  subtotal_cents    INTEGER NOT NULL DEFAULT 0,
  discount_cents    INTEGER NOT NULL DEFAULT 0,
  tax_rate_bp       INTEGER NOT NULL DEFAULT 0,  -- basis points (825 = 8.25%)
  tax_cents         INTEGER NOT NULL DEFAULT 0,
  total_cents       INTEGER NOT NULL DEFAULT 0,
  payment_method    TEXT NOT NULL DEFAULT 'card', -- card | terminal | cash
  payment_status    TEXT NOT NULL DEFAULT 'paid', -- paid | pending | failed | refunded
  square_payment_id TEXT,
  card_brand        TEXT,
  last4             TEXT,
  receipt_url       TEXT,
  note              TEXT,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at        TEXT
);

CREATE TABLE pos_sale_items (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id         INTEGER NOT NULL REFERENCES pos_sales(id) ON DELETE CASCADE,
  item_id         INTEGER REFERENCES inventory_items(id) ON DELETE SET NULL,
  kind            TEXT NOT NULL DEFAULT 'item', -- item | labor | custom
  description     TEXT NOT NULL,
  quantity        INTEGER NOT NULL DEFAULT 1,
  unit_price_cents INTEGER NOT NULL DEFAULT 0,
  line_total_cents INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at      TEXT
);

CREATE INDEX idx_pos_sales_ticket ON pos_sales(ticket_id);
CREATE INDEX idx_pos_sales_customer ON pos_sales(customer_id);
CREATE INDEX idx_pos_sales_created ON pos_sales(created_at);
CREATE INDEX idx_pos_sale_items_sale ON pos_sale_items(sale_id);

CREATE TRIGGER trg_pos_sales_upd AFTER UPDATE ON pos_sales FOR EACH ROW
BEGIN UPDATE pos_sales SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;
CREATE TRIGGER trg_pos_sale_items_upd AFTER UPDATE ON pos_sale_items FOR EACH ROW
BEGIN UPDATE pos_sale_items SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;

-- Square configuration (editable in Settings > Payments). JSON-encoded values.
INSERT INTO app_settings (key, value) VALUES
  ('square.enabled', 'false'),
  ('square.environment', '"production"'),
  ('square.application_id', '""'),
  ('square.access_token', '""'),
  ('square.location_id', '""'),
  ('square.device_id', '""'),
  ('square.currency', '"USD"'),
  ('square.webhook_signature_key', '""')
ON CONFLICT(key) DO NOTHING;

-- Register POS as a built-in plugin (the planned "POS System" plugin, using the
-- documented `net` capability for Square).
INSERT INTO plugin_registry (plugin_id, name, version, author, entry_point, permissions, enabled, manifest)
VALUES ('pos-square', 'POS (Square)', '1.0.0', 'userrepair', 'builtin',
        '["net:square","ui:sidebar","ui:main","data:read","data:write"]', 1,
        '{"name":"pos-square","version":"1.0.0","builtin":true,"description":"Point of sale with Square payments."}')
ON CONFLICT(plugin_id) DO NOTHING;
