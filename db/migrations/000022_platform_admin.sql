-- +goose Up
-- Platform staff who can use the admin app. Roles, from least to most access:
-- read_only (view everything), support (plus resends, retries, expiry extensions), super_admin (everything).
CREATE TYPE platform_admin_role AS ENUM ('read_only', 'support', 'super_admin');

CREATE TABLE platform_admins (
    user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    role platform_admin_role NOT NULL,
    -- NULL when granted from the command line (cmd/admin).
    granted_by uuid REFERENCES users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Append-only record of every change made through the admin app or cmd/admin.
CREATE TABLE admin_audit_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    action text NOT NULL,
    target_type text NOT NULL CHECK (target_type IN ('workspace', 'user', 'envelope', 'job', 'admin')),
    target_id text NOT NULL,
    reason text,
    before jsonb,
    after jsonb,
    ip_address text,
    user_agent text,
    occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX admin_audit_events_occurred_idx ON admin_audit_events (occurred_at DESC);
CREATE INDEX admin_audit_events_target_idx ON admin_audit_events (target_type, target_id, occurred_at DESC);
CREATE INDEX admin_audit_events_admin_idx ON admin_audit_events (admin_user_id, occurred_at DESC);

-- Suspension. Enforced by the customer-facing API middleware.
ALTER TABLE organizations ADD COLUMN suspended_at timestamptz;
ALTER TABLE organizations ADD COLUMN suspended_reason text;
ALTER TABLE users ADD COLUMN suspended_at timestamptz;
ALTER TABLE users ADD COLUMN suspended_reason text;

-- Admin search: case-insensitive lookups by name, slug and email.
CREATE INDEX IF NOT EXISTS organizations_name_lower_idx ON organizations (lower(name));
CREATE INDEX IF NOT EXISTS users_name_lower_idx ON users (lower(name));

-- +goose Down
DROP INDEX IF EXISTS users_name_lower_idx;
DROP INDEX IF EXISTS organizations_name_lower_idx;
ALTER TABLE users DROP COLUMN IF EXISTS suspended_reason;
ALTER TABLE users DROP COLUMN IF EXISTS suspended_at;
ALTER TABLE organizations DROP COLUMN IF EXISTS suspended_reason;
ALTER TABLE organizations DROP COLUMN IF EXISTS suspended_at;
DROP TABLE IF EXISTS admin_audit_events;
DROP TABLE IF EXISTS platform_admins;
DROP TYPE IF EXISTS platform_admin_role;
