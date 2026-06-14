-- Migration v14: customer rewards program (points balance + audit ledger).

ALTER TABLE customers ADD COLUMN points_balance INTEGER NOT NULL DEFAULT 0;

CREATE TABLE rewards_ledger (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id   INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  sale_id       INTEGER REFERENCES pos_sales(id) ON DELETE SET NULL,
  delta_points  INTEGER NOT NULL DEFAULT 0,   -- earn positive, redeem negative
  balance_after INTEGER NOT NULL DEFAULT 0,
  reason        TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at    TEXT
);

CREATE INDEX idx_rewards_ledger_customer ON rewards_ledger(customer_id);
CREATE INDEX idx_rewards_ledger_sale ON rewards_ledger(sale_id);

CREATE TRIGGER trg_rewards_ledger_upd AFTER UPDATE ON rewards_ledger FOR EACH ROW
BEGIN UPDATE rewards_ledger SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;

-- Rewards configuration (editable in Settings > Rewards).
INSERT INTO app_settings (key, value) VALUES
  ('rewards.enabled', 'false'),
  ('rewards.earn_per_dollar', '1'),        -- points earned per dollar spent
  ('rewards.redeem_cents_per_point', '1')  -- value of 1 point in cents when redeemed
ON CONFLICT(key) DO NOTHING;
