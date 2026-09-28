-- +goose Up
-- Read-only workspace role for auditors and reviewers. Adding an enum value is allowed inside a
-- transaction on PostgreSQL 12+ as long as the new value is not used in the same transaction.
ALTER TYPE membership_role ADD VALUE IF NOT EXISTS 'viewer';

ALTER TABLE organization_invitations
    ADD COLUMN accepted_by uuid REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN accepted_at timestamptz;

-- +goose Down
ALTER TABLE organization_invitations
    DROP COLUMN IF EXISTS accepted_at,
    DROP COLUMN IF EXISTS accepted_by;
-- PostgreSQL cannot drop an enum value; 'viewer' stays on membership_role.
