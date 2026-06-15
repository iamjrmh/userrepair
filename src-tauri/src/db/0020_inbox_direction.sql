-- Track which way an inbox message went so the reading pane can show a real
-- two-way thread. 'in' = received from the customer (webhook); 'out' = a reply
-- a staff member sent back. Existing rows are all inbound.
ALTER TABLE inbox_messages ADD COLUMN direction TEXT NOT NULL DEFAULT 'in';
