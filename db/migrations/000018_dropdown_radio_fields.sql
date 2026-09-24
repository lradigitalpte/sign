-- +goose Up
ALTER TYPE field_type ADD VALUE IF NOT EXISTS 'dropdown';
ALTER TYPE field_type ADD VALUE IF NOT EXISTS 'radio';
ALTER TABLE document_fields ADD COLUMN options jsonb;

-- +goose Down
ALTER TABLE document_fields DROP COLUMN IF EXISTS options;
