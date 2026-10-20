-- +goose Up
-- Set when Signet staff rename a personal workspace. Sign-in normally rewrites personal workspace names
-- ("<name>'s Workspace"); a locked name is kept. WorkOS-backed workspaces are renamed in WorkOS instead.
ALTER TABLE organizations ADD COLUMN name_locked_at timestamptz;

-- Accounts are anonymized rather than removed, because envelopes they sent in other workspaces still
-- point at them. deleted_at marks such accounts.
ALTER TABLE users ADD COLUMN deleted_at timestamptz;

-- A user's request to delete their own account, carried out 30 days later unless canceled.
CREATE TABLE account_deletion_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_email text NOT NULL,
    status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'canceled', 'completed', 'failed')),
    scheduled_for timestamptz NOT NULL,
    canceled_at timestamptz,
    canceled_by uuid REFERENCES users(id) ON DELETE SET NULL,
    completed_at timestamptz,
    error text,
    -- Problems that didn't stop the deletion, e.g. the WorkOS login couldn't be removed.
    warning text,
    workspaces_deleted integer,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX account_deletion_requests_open_idx ON account_deletion_requests (user_id) WHERE status IN ('scheduled', 'failed');
CREATE INDEX account_deletion_requests_due_idx ON account_deletion_requests (scheduled_for) WHERE status IN ('scheduled', 'failed');

-- +goose Down
DROP TABLE IF EXISTS account_deletion_requests;
ALTER TABLE users DROP COLUMN IF EXISTS deleted_at;
ALTER TABLE organizations DROP COLUMN IF EXISTS name_locked_at;
