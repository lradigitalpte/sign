-- +goose Up
-- Automatic reminders: when each recipient was last reminded and how many automatic reminders they received.
ALTER TABLE recipients ADD COLUMN IF NOT EXISTS last_reminded_at timestamptz;
ALTER TABLE recipients ADD COLUMN IF NOT EXISTS auto_reminder_count integer NOT NULL DEFAULT 0;

-- Signer passcode: failed-attempt throttling per recipient, and unlock state per signing link.
ALTER TABLE recipients ADD COLUMN IF NOT EXISTS passcode_failures integer NOT NULL DEFAULT 0;
ALTER TABLE recipients ADD COLUMN IF NOT EXISTS passcode_locked_until timestamptz;
ALTER TABLE signing_tokens ADD COLUMN IF NOT EXISTS passcode_verified_at timestamptz;

-- Passcodes were stored as plain text; keep only bcrypt hashes from now on.
UPDATE envelopes SET passcode = crypt(passcode, gen_salt('bf', 10)) WHERE passcode IS NOT NULL AND passcode NOT LIKE '$2%';

CREATE INDEX IF NOT EXISTS envelopes_in_progress_expiry_idx ON envelopes (expires_at) WHERE status = 'in_progress';

-- +goose Down
DROP INDEX IF EXISTS envelopes_in_progress_expiry_idx;
ALTER TABLE signing_tokens DROP COLUMN IF EXISTS passcode_verified_at;
ALTER TABLE recipients DROP COLUMN IF EXISTS passcode_locked_until;
ALTER TABLE recipients DROP COLUMN IF EXISTS passcode_failures;
ALTER TABLE recipients DROP COLUMN IF EXISTS auto_reminder_count;
ALTER TABLE recipients DROP COLUMN IF EXISTS last_reminded_at;
