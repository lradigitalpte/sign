-- +goose Up
ALTER TABLE envelope_attachments
    ADD COLUMN kind text NOT NULL DEFAULT 'link' CHECK (kind IN ('link', 'file')),
    ADD COLUMN object_key text,
    ADD COLUMN filename text,
    ADD COLUMN mime_type text,
    ADD COLUMN size_bytes bigint CHECK (size_bytes IS NULL OR size_bytes >= 0),
    ADD COLUMN sha256 text;

ALTER TABLE envelope_attachments ALTER COLUMN url DROP NOT NULL;

ALTER TABLE envelope_attachments ADD CONSTRAINT envelope_attachments_payload_check CHECK (
    (kind = 'link' AND url IS NOT NULL) OR
    (kind = 'file' AND object_key IS NOT NULL AND filename IS NOT NULL AND mime_type IS NOT NULL AND size_bytes IS NOT NULL)
);

ALTER TYPE field_type ADD VALUE IF NOT EXISTS 'attachment';

-- +goose Down
ALTER TABLE envelope_attachments DROP CONSTRAINT IF EXISTS envelope_attachments_payload_check;
ALTER TABLE envelope_attachments
    DROP COLUMN IF EXISTS sha256,
    DROP COLUMN IF EXISTS size_bytes,
    DROP COLUMN IF EXISTS mime_type,
    DROP COLUMN IF EXISTS filename,
    DROP COLUMN IF EXISTS object_key,
    DROP COLUMN IF EXISTS kind;
UPDATE envelope_attachments SET url = '' WHERE url IS NULL;
ALTER TABLE envelope_attachments ALTER COLUMN url SET NOT NULL;
