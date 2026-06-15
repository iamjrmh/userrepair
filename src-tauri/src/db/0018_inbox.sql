-- Inbox for customer replies to outbound texts, received via the Pingram inbound
-- webhook (POSTed to the host server's /inbound/sms). Manager+ only in the UI;
-- a nice-to-have so the shop can see what people respond and reply when urgent.
CREATE TABLE IF NOT EXISTS inbox_messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  channel     TEXT NOT NULL DEFAULT 'sms', -- sms | email
  from_addr   TEXT NOT NULL,               -- phone number or email address
  from_name   TEXT,                        -- matched customer name, if known
  customer_id INTEGER,                      -- linked customer, if matched
  body        TEXT NOT NULL,
  is_read     INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_inbox_created ON inbox_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_inbox_unread ON inbox_messages(is_read);
