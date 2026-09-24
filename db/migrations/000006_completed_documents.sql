-- +goose Up
ALTER TABLE documents
    ADD COLUMN completed_object_key text,
    ADD COLUMN completed_sha256 text,
    ADD COLUMN completed_at timestamptz;
CREATE UNIQUE INDEX documents_completed_object_key_unique ON documents (completed_object_key) WHERE completed_object_key IS NOT NULL;

-- +goose Down
DROP INDEX IF EXISTS documents_completed_object_key_unique;
ALTER TABLE documents
    DROP COLUMN IF EXISTS completed_at,
    DROP COLUMN IF EXISTS completed_sha256,
    DROP COLUMN IF EXISTS completed_object_key;
