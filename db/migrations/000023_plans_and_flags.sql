-- +goose Up
-- A workspace's plan, set by Signet staff in the admin app until a payment provider is connected.
-- No row means the Free plan. Plans aren't enforced yet: seats and features are shown, not blocked.
CREATE TABLE organization_subscriptions (
    organization_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
    plan text NOT NULL CHECK (plan IN ('free', 'starter', 'business', 'premium', 'enterprise')),
    seats integer NOT NULL DEFAULT 1 CHECK (seats BETWEEN 1 AND 10000),
    billing_cycle text CHECK (billing_cycle IN ('monthly', 'annual')),
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('trialing', 'active', 'past_due', 'canceled')),
    -- When the trial ends or the paid period renews (or lapses, once canceled).
    period_ends_at timestamptz,
    -- Internal note for staff, e.g. the invoice or contract reference.
    note text,
    updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX organization_subscriptions_plan_idx ON organization_subscriptions (plan);

-- Feature flags: a global default plus per-workspace overrides.
CREATE TABLE feature_flags (
    key text PRIMARY KEY CHECK (key ~ '^[a-z][a-z0-9_.-]{1,62}$'),
    description text NOT NULL DEFAULT '',
    enabled boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE feature_flag_overrides (
    flag_key text NOT NULL REFERENCES feature_flags(key) ON DELETE CASCADE,
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    enabled boolean NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (flag_key, organization_id)
);
CREATE INDEX feature_flag_overrides_organization_idx ON feature_flag_overrides (organization_id);

CREATE INDEX auth_webhook_events_received_idx ON auth_webhook_events (received_at DESC);

ALTER TABLE admin_audit_events DROP CONSTRAINT admin_audit_events_target_type_check;
ALTER TABLE admin_audit_events ADD CONSTRAINT admin_audit_events_target_type_check
    CHECK (target_type IN ('workspace', 'user', 'envelope', 'job', 'admin', 'flag', 'webhook'));

-- +goose Down
ALTER TABLE admin_audit_events DROP CONSTRAINT admin_audit_events_target_type_check;
ALTER TABLE admin_audit_events ADD CONSTRAINT admin_audit_events_target_type_check
    CHECK (target_type IN ('workspace', 'user', 'envelope', 'job', 'admin'));
DROP INDEX IF EXISTS auth_webhook_events_received_idx;
DROP TABLE IF EXISTS feature_flag_overrides;
DROP TABLE IF EXISTS feature_flags;
DROP TABLE IF EXISTS organization_subscriptions;
