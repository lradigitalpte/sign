-- +goose Up
CREATE TABLE folders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name text NOT NULL,
    created_by uuid NOT NULL REFERENCES users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT folders_name_trimmed CHECK (btrim(name) <> '' AND name = btrim(name))
);

CREATE UNIQUE INDEX folders_org_name_lower_unique ON folders (organization_id, lower(name));
CREATE INDEX folders_organization_idx ON folders (organization_id, name);

ALTER TABLE envelopes
    ADD COLUMN folder_id uuid REFERENCES folders(id) ON DELETE SET NULL;

CREATE INDEX envelopes_organization_folder_idx
    ON envelopes (organization_id, folder_id, updated_at DESC);

-- +goose Down
DROP INDEX IF EXISTS envelopes_organization_folder_idx;
ALTER TABLE envelopes DROP COLUMN IF EXISTS folder_id;
DROP TABLE IF EXISTS folders;
