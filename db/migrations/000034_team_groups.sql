-- +goose Up
-- A member group attached to a team gives everyone in the group access to the team, with the group's role.
CREATE TABLE team_groups (
    team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    group_id uuid NOT NULL REFERENCES member_groups(id) ON DELETE CASCADE,
    role membership_role NOT NULL DEFAULT 'member',
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (team_id, group_id)
);
CREATE INDEX team_groups_group_idx ON team_groups (group_id);
CREATE INDEX member_group_members_user_idx ON member_group_members (user_id);

-- A person's role on a team, directly or through any of their groups; the highest wins. NULL when they're not on it.
CREATE FUNCTION team_role(team uuid, member uuid) RETURNS text
LANGUAGE sql STABLE AS $$
    SELECT role FROM (
        SELECT tm.role::text AS role FROM team_memberships tm WHERE tm.team_id = $1 AND tm.user_id = $2
        UNION ALL
        SELECT tg.role::text FROM team_groups tg JOIN member_group_members gm ON gm.group_id = tg.group_id
        WHERE tg.team_id = $1 AND gm.user_id = $2
    ) roles
    ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END
    LIMIT 1
$$;

-- Leaving a workspace takes a person off its teams and groups, so being invited back later starts fresh.
CREATE FUNCTION remove_team_and_group_memberships() RETURNS trigger AS $$
BEGIN
    DELETE FROM team_memberships tm USING teams t
    WHERE tm.team_id = t.id AND t.organization_id = OLD.organization_id AND tm.user_id = OLD.user_id;
    DELETE FROM member_group_members gm USING member_groups g
    WHERE gm.group_id = g.id AND g.organization_id = OLD.organization_id AND gm.user_id = OLD.user_id;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER organization_memberships_cleanup AFTER DELETE ON organization_memberships
FOR EACH ROW EXECUTE FUNCTION remove_team_and_group_memberships();

-- Clean up memberships left behind by people who already left.
DELETE FROM team_memberships tm USING teams t
WHERE tm.team_id = t.id AND NOT EXISTS (SELECT 1 FROM organization_memberships m WHERE m.organization_id = t.organization_id AND m.user_id = tm.user_id);
DELETE FROM member_group_members gm USING member_groups g
WHERE gm.group_id = g.id AND NOT EXISTS (SELECT 1 FROM organization_memberships m WHERE m.organization_id = g.organization_id AND m.user_id = gm.user_id);

-- +goose Down
DROP TRIGGER IF EXISTS organization_memberships_cleanup ON organization_memberships;
DROP FUNCTION IF EXISTS remove_team_and_group_memberships();
DROP FUNCTION IF EXISTS team_role(uuid, uuid);
DROP INDEX IF EXISTS member_group_members_user_idx;
DROP TABLE IF EXISTS team_groups;
