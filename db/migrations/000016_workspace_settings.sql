-- +goose Up
CREATE TABLE organization_settings (
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    section text NOT NULL,
    config jsonb NOT NULL DEFAULT '{}'::jsonb,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (organization_id, section)
);

-- +goose Down
DROP TABLE organization_settings;
