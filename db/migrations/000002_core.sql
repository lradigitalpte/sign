-- +goose Up
CREATE TYPE membership_role AS ENUM ('owner', 'admin', 'member');
CREATE TYPE envelope_status AS ENUM ('draft', 'in_progress', 'completed', 'voided', 'expired');
CREATE TYPE recipient_role AS ENUM ('signer', 'approver', 'viewer', 'cc');
CREATE TYPE recipient_status AS ENUM ('pending', 'sent', 'viewed', 'completed', 'declined');
CREATE TYPE field_type AS ENUM ('signature', 'initials', 'name', 'date', 'text', 'checkbox');

CREATE TABLE users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text NOT NULL,
    name text NOT NULL,
    password_hash text,
    email_verified_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT users_email_normalized CHECK (email = lower(trim(email)))
);
CREATE UNIQUE INDEX users_email_unique ON users (email);

CREATE TABLE organizations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    slug text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX organizations_slug_unique ON organizations (slug);

CREATE TABLE organization_memberships (
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role membership_role NOT NULL DEFAULT 'member',
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (organization_id, user_id)
);

CREATE TABLE envelopes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    created_by uuid NOT NULL REFERENCES users(id),
    title text NOT NULL,
    status envelope_status NOT NULL DEFAULT 'draft',
    language text NOT NULL DEFAULT 'en',
    timezone text NOT NULL DEFAULT 'Etc/UTC',
    date_format text NOT NULL DEFAULT 'YYYY-MM-DD',
    external_id text,
    redirect_url text,
    expires_at timestamptz,
    sent_at timestamptz,
    completed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX envelopes_organization_status_idx ON envelopes (organization_id, status, updated_at DESC);

CREATE TABLE documents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    envelope_id uuid NOT NULL REFERENCES envelopes(id) ON DELETE CASCADE,
    position integer NOT NULL DEFAULT 0,
    filename text NOT NULL,
    object_key text NOT NULL,
    mime_type text NOT NULL DEFAULT 'application/pdf',
    size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
    page_count integer NOT NULL DEFAULT 1 CHECK (page_count > 0),
    sha256 text,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (envelope_id, position),
    UNIQUE (object_key)
);

CREATE TABLE recipients (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    envelope_id uuid NOT NULL REFERENCES envelopes(id) ON DELETE CASCADE,
    user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    name text NOT NULL,
    email text NOT NULL,
    role recipient_role NOT NULL DEFAULT 'signer',
    status recipient_status NOT NULL DEFAULT 'pending',
    signing_order integer NOT NULL DEFAULT 1 CHECK (signing_order > 0),
    sent_at timestamptz,
    viewed_at timestamptz,
    completed_at timestamptz,
    declined_at timestamptz,
    decline_reason text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT recipients_email_normalized CHECK (email = lower(trim(email)))
);
CREATE INDEX recipients_envelope_order_idx ON recipients (envelope_id, signing_order);
CREATE INDEX recipients_user_inbox_idx ON recipients (user_id, status, updated_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX recipients_email_inbox_idx ON recipients (email, status, updated_at DESC);

CREATE TABLE document_fields (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    recipient_id uuid NOT NULL REFERENCES recipients(id) ON DELETE CASCADE,
    type field_type NOT NULL,
    page integer NOT NULL CHECK (page > 0),
    x numeric(7,4) NOT NULL CHECK (x >= 0 AND x <= 100),
    y numeric(7,4) NOT NULL CHECK (y >= 0 AND y <= 100),
    width numeric(7,4) NOT NULL CHECK (width > 0 AND width <= 100),
    height numeric(7,4) NOT NULL CHECK (height > 0 AND height <= 100),
    label text,
    required boolean NOT NULL DEFAULT true,
    value jsonb,
    completed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX document_fields_document_page_idx ON document_fields (document_id, page);
CREATE INDEX document_fields_recipient_idx ON document_fields (recipient_id);

CREATE TABLE signing_tokens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_id uuid NOT NULL REFERENCES recipients(id) ON DELETE CASCADE,
    token_hash bytea NOT NULL,
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    last_used_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (token_hash)
);
CREATE INDEX signing_tokens_recipient_idx ON signing_tokens (recipient_id, created_at DESC);

CREATE TABLE audit_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    envelope_id uuid NOT NULL REFERENCES envelopes(id) ON DELETE CASCADE,
    actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    recipient_id uuid REFERENCES recipients(id) ON DELETE SET NULL,
    event_type text NOT NULL,
    ip_address inet,
    user_agent text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_events_envelope_time_idx ON audit_events (envelope_id, occurred_at, id);

-- +goose Down
DROP TABLE IF EXISTS audit_events;
DROP TABLE IF EXISTS signing_tokens;
DROP TABLE IF EXISTS document_fields;
DROP TABLE IF EXISTS recipients;
DROP TABLE IF EXISTS documents;
DROP TABLE IF EXISTS envelopes;
DROP TABLE IF EXISTS organization_memberships;
DROP TABLE IF EXISTS organizations;
DROP TABLE IF EXISTS users;
DROP TYPE IF EXISTS field_type;
DROP TYPE IF EXISTS recipient_status;
DROP TYPE IF EXISTS recipient_role;
DROP TYPE IF EXISTS envelope_status;
DROP TYPE IF EXISTS membership_role;
