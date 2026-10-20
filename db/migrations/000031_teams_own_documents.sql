-- +goose Up
-- Teams own documents. An organization (workspace) holds billing, members and default settings; its teams
-- hold envelopes, templates and folders. Every organization has exactly one default team that all its
-- members can use, so a workspace without other teams works as before.

-- A team outlives the person who created it.
ALTER TABLE teams ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE teams DROP CONSTRAINT IF EXISTS teams_created_by_fkey;
ALTER TABLE teams ADD CONSTRAINT teams_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE teams ADD COLUMN is_default boolean NOT NULL DEFAULT false;

-- Organizations without a team get one.
INSERT INTO teams (organization_id, name, slug, created_by)
SELECT o.id, 'General', 'general',
       (SELECT m.user_id FROM organization_memberships m WHERE m.organization_id = o.id ORDER BY m.created_at LIMIT 1)
FROM organizations o
WHERE NOT EXISTS (SELECT 1 FROM teams t WHERE t.organization_id = o.id);

-- The oldest team of each organization becomes its default team, named General.
UPDATE teams SET is_default = true
WHERE id IN (SELECT DISTINCT ON (organization_id) id FROM teams ORDER BY organization_id, created_at, id);
UPDATE teams t SET name = 'General', slug = 'general', updated_at = now()
WHERE t.is_default AND NOT EXISTS (SELECT 1 FROM teams o WHERE o.organization_id = t.organization_id AND o.slug = 'general' AND o.id <> t.id);
CREATE UNIQUE INDEX teams_one_default_per_organization ON teams (organization_id) WHERE is_default;

-- New organizations get their default team automatically, wherever they're created.
CREATE FUNCTION create_default_team() RETURNS trigger AS $$
BEGIN
    INSERT INTO teams (organization_id, name, slug, is_default) VALUES (NEW.id, 'General', 'general', true);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER organizations_default_team AFTER INSERT ON organizations FOR EACH ROW EXECUTE FUNCTION create_default_team();

-- Envelopes (and templates, which are envelopes) and folders belong to a team.
ALTER TABLE envelopes ADD COLUMN team_id uuid REFERENCES teams(id);
UPDATE envelopes e SET team_id = t.id FROM teams t WHERE t.organization_id = e.organization_id AND t.is_default;
ALTER TABLE envelopes ALTER COLUMN team_id SET NOT NULL;
CREATE INDEX envelopes_team_updated_idx ON envelopes (team_id, updated_at DESC);

ALTER TABLE folders ADD COLUMN team_id uuid REFERENCES teams(id) ON DELETE CASCADE;
UPDATE folders f SET team_id = t.id FROM teams t WHERE t.organization_id = f.organization_id AND t.is_default;
ALTER TABLE folders ALTER COLUMN team_id SET NOT NULL;
-- Folder names are unique within a team, not across the whole organization.
DROP INDEX IF EXISTS folders_org_name_lower_unique;
CREATE UNIQUE INDEX folders_team_name_lower_unique ON folders (team_id, lower(name));

-- +goose Down
DROP INDEX IF EXISTS folders_team_name_lower_unique;
CREATE UNIQUE INDEX folders_org_name_lower_unique ON folders (organization_id, lower(name));
ALTER TABLE folders DROP COLUMN IF EXISTS team_id;
DROP INDEX IF EXISTS envelopes_team_updated_idx;
ALTER TABLE envelopes DROP COLUMN IF EXISTS team_id;
DROP TRIGGER IF EXISTS organizations_default_team ON organizations;
DROP FUNCTION IF EXISTS create_default_team();
DROP INDEX IF EXISTS teams_one_default_per_organization;
ALTER TABLE teams DROP COLUMN IF EXISTS is_default;
