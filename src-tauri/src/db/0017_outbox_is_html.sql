-- Distinguish HTML status emails from plain-text email-to-SMS gateway messages.
-- 1 = HTML (rich status email), 0 = plain text (carrier SMS gateway).
ALTER TABLE notification_outbox ADD COLUMN is_html INTEGER NOT NULL DEFAULT 1;
