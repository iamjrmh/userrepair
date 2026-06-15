-- Route queued notifications through the right transport and sender. 'smtp' uses
-- the shop's own SMTP server (legacy/backup); 'pingram' sends via the Pingram
-- email API with a per-user sender (e.g. JURMR@iamjrmh.xyz, "Jeremiah (Owner)").
ALTER TABLE notification_outbox ADD COLUMN channel TEXT NOT NULL DEFAULT 'smtp';
ALTER TABLE notification_outbox ADD COLUMN from_name TEXT NOT NULL DEFAULT '';
ALTER TABLE notification_outbox ADD COLUMN from_addr TEXT NOT NULL DEFAULT '';
