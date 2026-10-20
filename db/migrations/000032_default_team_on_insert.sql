-- +goose Up
-- An envelope or folder created without a team goes to its workspace's default team, so code that
-- predates teams (imports, tools, tests) keeps working. The API always sets the team itself.
CREATE FUNCTION set_default_team() RETURNS trigger AS $$
BEGIN
    IF NEW.team_id IS NULL THEN
        SELECT id INTO NEW.team_id FROM teams WHERE organization_id = NEW.organization_id AND is_default;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER envelopes_default_team BEFORE INSERT ON envelopes FOR EACH ROW EXECUTE FUNCTION set_default_team();
CREATE TRIGGER folders_default_team BEFORE INSERT ON folders FOR EACH ROW EXECUTE FUNCTION set_default_team();

-- +goose Down
DROP TRIGGER IF EXISTS folders_default_team ON folders;
DROP TRIGGER IF EXISTS envelopes_default_team ON envelopes;
DROP FUNCTION IF EXISTS set_default_team();
