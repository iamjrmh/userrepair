-- Outbox queue for customer notification emails.
--
-- A status-change email is enqueued here and sent right away when possible. If
-- the internet is down at that moment the row stays 'pending' and a background
-- flusher retries it once the connection returns, so an update is never lost.
-- The 'sending' state is a short-lived claim so two PCs flushing the shared
-- queue do not send the same email twice.
CREATE TABLE IF NOT EXISTS notification_outbox (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  to_email    TEXT NOT NULL,
  subject     TEXT NOT NULL,
  html_body   TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending', -- pending | sending | sent | failed
  attempts    INTEGER NOT NULL DEFAULT 0,
  last_error  TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  sent_at     TEXT
);

CREATE INDEX IF NOT EXISTS idx_outbox_status ON notification_outbox(status);
