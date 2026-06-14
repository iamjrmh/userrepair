-- Migration v13: per-sale payment tenders, so a sale can be split across cash
-- and one or more cards (or a Square Terminal).

CREATE TABLE pos_payments (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id           INTEGER NOT NULL REFERENCES pos_sales(id) ON DELETE CASCADE,
  method            TEXT NOT NULL,            -- cash | card | terminal
  amount_cents      INTEGER NOT NULL DEFAULT 0,
  tendered_cents    INTEGER,                  -- cash: amount handed over
  change_cents      INTEGER,                  -- cash: change returned
  square_payment_id TEXT,
  card_brand        TEXT,
  last4             TEXT,
  receipt_url       TEXT,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at        TEXT
);

CREATE INDEX idx_pos_payments_sale ON pos_payments(sale_id);

CREATE TRIGGER trg_pos_payments_upd AFTER UPDATE ON pos_payments FOR EACH ROW
BEGIN UPDATE pos_payments SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;
