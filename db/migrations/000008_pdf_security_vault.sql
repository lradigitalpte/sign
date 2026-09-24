-- +goose Up
CREATE TABLE pdf_security_files (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    created_by uuid NOT NULL REFERENCES users(id),
    filename text NOT NULL,
    object_key text NOT NULL UNIQUE,
    mime_type text NOT NULL DEFAULT 'application/pdf',
    size_bytes bigint NOT NULL,
    sha256 text NOT NULL,
    operation text NOT NULL CHECK (operation IN ('encrypted','decrypted')),
    source_filename text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz
);

CREATE TABLE pdf_security_password_versions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id uuid NOT NULL REFERENCES pdf_security_files(id) ON DELETE CASCADE,
    version integer NOT NULL,
    password_ciphertext bytea NOT NULL,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','retired','deleted')),
    created_by uuid NOT NULL REFERENCES users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    retired_at timestamptz,
    deleted_at timestamptz,
    UNIQUE(file_id, version)
);

CREATE TABLE pdf_security_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id uuid NOT NULL REFERENCES pdf_security_files(id) ON DELETE CASCADE,
    actor_id uuid REFERENCES users(id),
    event_type text NOT NULL,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE pdf_security_shares (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id uuid NOT NULL REFERENCES pdf_security_files(id) ON DELETE CASCADE,
    created_by uuid NOT NULL REFERENCES users(id),
    recipient_email text NOT NULL,
    token_hash bytea NOT NULL UNIQUE,
    pin_ciphertext bytea NOT NULL,
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    access_count integer NOT NULL DEFAULT 0,
    last_accessed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX pdf_security_files_workspace_idx ON pdf_security_files(organization_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX pdf_security_events_file_idx ON pdf_security_events(file_id, occurred_at DESC);
CREATE INDEX pdf_security_shares_file_idx ON pdf_security_shares(file_id, created_at DESC);

-- +goose Down
DROP TABLE IF EXISTS pdf_security_events;
DROP TABLE IF EXISTS pdf_security_shares;
DROP TABLE IF EXISTS pdf_security_password_versions;
DROP TABLE IF EXISTS pdf_security_files;
