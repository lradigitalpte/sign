-- +goose Up
CREATE TYPE invitation_status AS ENUM ('pending', 'accepted', 'revoked', 'expired');

CREATE TABLE organization_invitations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email text NOT NULL,
    role membership_role NOT NULL DEFAULT 'member',
    status invitation_status NOT NULL DEFAULT 'pending',
    token text NOT NULL UNIQUE,
    invited_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX organization_invitations_org_idx ON organization_invitations (organization_id, status);

-- +goose Down
DROP TABLE IF EXISTS organization_invitations;
DROP TYPE IF EXISTS invitation_status;
