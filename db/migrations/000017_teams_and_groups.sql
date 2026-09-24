-- +goose Up
CREATE TABLE teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, slug)
);
CREATE TABLE team_memberships (
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role membership_role NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, user_id)
);
CREATE TABLE member_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);
CREATE TABLE member_group_members (
  group_id uuid NOT NULL REFERENCES member_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, user_id)
);

-- Seed default 'Personal Team' for existing organizations
INSERT INTO teams (organization_id, name, slug, created_by)
SELECT o.id, 'Personal Team', 'personal-team', m.user_id
FROM organizations o
JOIN LATERAL (
  SELECT user_id FROM organization_memberships WHERE organization_id = o.id ORDER BY created_at ASC LIMIT 1
) m ON true
ON CONFLICT (organization_id, slug) DO NOTHING;

INSERT INTO team_memberships (team_id, user_id, role)
SELECT t.id, t.created_by, 'owner'
FROM teams t
ON CONFLICT (team_id, user_id) DO NOTHING;

-- +goose Down
DROP TABLE member_group_members;
DROP TABLE member_groups;
DROP TABLE team_memberships;
DROP TABLE teams;
