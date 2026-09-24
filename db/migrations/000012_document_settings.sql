-- +goose Up
ALTER TABLE envelopes ADD COLUMN IF NOT EXISTS allowed_signature_types text NOT NULL DEFAULT 'type_draw_upload';
ALTER TABLE envelopes ADD COLUMN IF NOT EXISTS auto_reminders boolean NOT NULL DEFAULT true;
ALTER TABLE envelopes ADD COLUMN IF NOT EXISTS first_reminder_days integer NOT NULL DEFAULT 3;
ALTER TABLE envelopes ADD COLUMN IF NOT EXISTS repeat_reminder_days integer NOT NULL DEFAULT 2;
ALTER TABLE envelopes ADD COLUMN IF NOT EXISTS notify_on_view boolean NOT NULL DEFAULT true;
ALTER TABLE envelopes ADD COLUMN IF NOT EXISTS notify_on_sign boolean NOT NULL DEFAULT true;
ALTER TABLE envelopes ADD COLUMN IF NOT EXISTS attach_completed_pdf boolean NOT NULL DEFAULT true;
ALTER TABLE envelopes ADD COLUMN IF NOT EXISTS session_timeout_minutes integer NOT NULL DEFAULT 60;
ALTER TABLE envelopes ADD COLUMN IF NOT EXISTS require_passcode boolean NOT NULL DEFAULT false;
ALTER TABLE envelopes ADD COLUMN IF NOT EXISTS passcode text;

-- +goose Down
ALTER TABLE envelopes DROP COLUMN IF EXISTS passcode;
ALTER TABLE envelopes DROP COLUMN IF EXISTS require_passcode;
ALTER TABLE envelopes DROP COLUMN IF EXISTS session_timeout_minutes;
ALTER TABLE envelopes DROP COLUMN IF EXISTS attach_completed_pdf;
ALTER TABLE envelopes DROP COLUMN IF EXISTS notify_on_sign;
ALTER TABLE envelopes DROP COLUMN IF EXISTS notify_on_view;
ALTER TABLE envelopes DROP COLUMN IF EXISTS repeat_reminder_days;
ALTER TABLE envelopes DROP COLUMN IF EXISTS first_reminder_days;
ALTER TABLE envelopes DROP COLUMN IF EXISTS auto_reminders;
ALTER TABLE envelopes DROP COLUMN IF EXISTS allowed_signature_types;
