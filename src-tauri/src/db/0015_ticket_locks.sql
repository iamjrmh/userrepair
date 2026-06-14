-- Ticket edit locks for multi-PC deployments.
--
-- One row per ticket means one active editor. The holding machine refreshes
-- heartbeat_at on a short interval; a lock whose heartbeat is older than the
-- app's staleness window is treated as abandoned (the editor closed the app or
-- lost power) and the next machine to open the ticket may take it over. This
-- stops a technician's in-progress edits from being clobbered when a clerk
-- opens the same ticket on another PC.
CREATE TABLE IF NOT EXISTS ticket_locks (
  ticket_id    INTEGER PRIMARY KEY REFERENCES tickets(id) ON DELETE CASCADE,
  holder_id    INTEGER,
  holder_name  TEXT NOT NULL,
  station      TEXT NOT NULL,
  locked_at    TEXT NOT NULL,
  heartbeat_at TEXT NOT NULL
);
