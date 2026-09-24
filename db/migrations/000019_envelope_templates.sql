-- +goose Up
ALTER TABLE envelopes ADD COLUMN is_template boolean NOT NULL DEFAULT false;
CREATE INDEX envelopes_is_template_idx ON envelopes (organization_id, is_template);

-- +goose Down
DROP INDEX IF EXISTS envelopes_is_template_idx;
ALTER TABLE envelopes DROP COLUMN IF EXISTS is_template;
