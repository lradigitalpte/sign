-- +goose Up
-- What processing a WorkOS webhook event did, in words, e.g. "Updated name for ana@example.com".
ALTER TABLE auth_webhook_events ADD COLUMN outcome text;

-- +goose Down
ALTER TABLE auth_webhook_events DROP COLUMN IF EXISTS outcome;
