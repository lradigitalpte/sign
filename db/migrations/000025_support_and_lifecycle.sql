-- +goose Up
-- Banners Signet staff show in the customer app, to everyone or to chosen plans.
CREATE TABLE announcements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title text NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
    body text NOT NULL DEFAULT '' CHECK (length(body) <= 600),
    severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
    -- Empty means every workspace; otherwise only workspaces on these plans.
    plans text[] NOT NULL DEFAULT '{}',
    link_url text CHECK (link_url IS NULL OR link_url ~ '^https?://'),
    link_label text,
    starts_at timestamptz NOT NULL DEFAULT now(),
    ends_at timestamptz,
    created_by uuid REFERENCES users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (ends_at IS NULL OR ends_at > starts_at)
);
CREATE INDEX announcements_active_idx ON announcements (starts_at, ends_at);

-- A workspace owner or admin lets Signet support open the workspace's documents, read-only, for a while.
CREATE TABLE support_access_grants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    granted_by uuid REFERENCES users(id) ON DELETE SET NULL,
    note text,
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    revoked_by uuid REFERENCES users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX support_access_grants_org_idx ON support_access_grants (organization_id, expires_at DESC);

-- Owner-requested workspace deletion, carried out 30 days later unless canceled.
-- The row outlives the workspace (organization_id becomes NULL), so the name is kept for the record.
CREATE TABLE workspace_deletion_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
    organization_name text NOT NULL,
    requested_by uuid REFERENCES users(id) ON DELETE SET NULL,
    requested_by_email text NOT NULL,
    status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'canceled', 'completed', 'failed')),
    scheduled_for timestamptz NOT NULL,
    canceled_at timestamptz,
    canceled_by uuid REFERENCES users(id) ON DELETE SET NULL,
    completed_at timestamptz,
    error text,
    envelopes_deleted integer,
    files_deleted integer,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
-- At most one open request per workspace.
CREATE UNIQUE INDEX workspace_deletion_requests_open_idx ON workspace_deletion_requests (organization_id) WHERE status IN ('scheduled', 'failed');
CREATE INDEX workspace_deletion_requests_due_idx ON workspace_deletion_requests (scheduled_for) WHERE status IN ('scheduled', 'failed');

-- What the retention job deleted, per workspace and run (envelope titles aren't kept: the point is that they're gone).
CREATE TABLE retention_runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
    envelopes_deleted integer NOT NULL,
    files_deleted integer NOT NULL,
    error text,
    ran_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX retention_runs_org_idx ON retention_runs (organization_id, ran_at DESC);

ALTER TABLE admin_audit_events DROP CONSTRAINT admin_audit_events_target_type_check;
ALTER TABLE admin_audit_events ADD CONSTRAINT admin_audit_events_target_type_check
    CHECK (target_type IN ('workspace', 'user', 'envelope', 'job', 'admin', 'flag', 'webhook', 'announcement', 'deletion'));

-- +goose Down
ALTER TABLE admin_audit_events DROP CONSTRAINT admin_audit_events_target_type_check;
ALTER TABLE admin_audit_events ADD CONSTRAINT admin_audit_events_target_type_check
    CHECK (target_type IN ('workspace', 'user', 'envelope', 'job', 'admin', 'flag', 'webhook'));
DROP TABLE IF EXISTS retention_runs;
DROP TABLE IF EXISTS workspace_deletion_requests;
DROP TABLE IF EXISTS support_access_grants;
DROP TABLE IF EXISTS announcements;
