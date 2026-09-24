-- +goose Up
ALTER TABLE envelopes ADD COLUMN IF NOT EXISTS distribution_method text NOT NULL DEFAULT 'email';

-- +goose Down
ALTER TABLE envelopes DROP COLUMN IF EXISTS distribution_method;
