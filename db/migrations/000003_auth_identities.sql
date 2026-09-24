-- +goose Up
CREATE TABLE auth_identities (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references users(id) on delete cascade,
    provider text not null,
    provider_subject text not null,
    provider_email text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (provider, provider_subject),
    unique (user_id, provider)
);

CREATE TABLE organization_auth_identities (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references organizations(id) on delete cascade,
    provider text not null,
    provider_subject text not null,
    created_at timestamptz not null default now(),
    unique (provider, provider_subject),
    unique (organization_id, provider)
);

CREATE TABLE auth_webhook_events (
    id uuid primary key default gen_random_uuid(),
    provider text not null,
    provider_event_id text not null,
    event_type text not null,
    payload jsonb not null,
    received_at timestamptz not null default now(),
    processed_at timestamptz,
    processing_error text,
    unique (provider, provider_event_id)
);

CREATE INDEX auth_identities_user_id_idx ON auth_identities (user_id);
CREATE INDEX organization_auth_identities_organization_id_idx
    on organization_auth_identities (organization_id);

-- +goose Down
DROP TABLE IF EXISTS auth_webhook_events;
DROP TABLE IF EXISTS organization_auth_identities;
DROP TABLE IF EXISTS auth_identities;
