-- Migration v12: employee login accounts on the technicians table.
-- Roles: owner | manager | technician | clerk.
-- The first owner account is created by the first-run setup wizard.

ALTER TABLE technicians ADD COLUMN username TEXT;
ALTER TABLE technicians ADD COLUMN password_hash TEXT;

CREATE UNIQUE INDEX idx_technicians_username
  ON technicians(username) WHERE username IS NOT NULL;
