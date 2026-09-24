-- +goose Up
ALTER TABLE recipients ADD COLUMN private_message text;
ALTER TABLE envelopes ADD COLUMN email_subject text;
ALTER TABLE envelopes ADD COLUMN email_body text;

CREATE TABLE envelope_attachments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    envelope_id uuid NOT NULL REFERENCES envelopes(id) ON DELETE CASCADE,
    label text NOT NULL,
    url text NOT NULL,
    position integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX envelope_attachments_envelope_idx ON envelope_attachments (envelope_id, position);

-- +goose Down
DROP TABLE IF EXISTS envelope_attachments;
ALTER TABLE envelopes DROP COLUMN IF EXISTS email_body;
ALTER TABLE envelopes DROP COLUMN IF EXISTS email_subject;
ALTER TABLE recipients DROP COLUMN IF EXISTS private_message;
