-- +goose Up
-- Team settings override the organization's, key by key. A team without a row (and always the default
-- team) uses the organization's settings. Only these sections can be set per team.
CREATE TABLE team_settings (
    team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    section text NOT NULL CHECK (section IN ('preferences', 'notifications', 'branding')),
    config jsonb NOT NULL DEFAULT '{}'::jsonb,
    updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (team_id, section)
);

-- The settings that apply to a team: the organization's, with the team's own values on top.
CREATE FUNCTION effective_settings(organization uuid, team uuid, settings_section text) RETURNS jsonb
LANGUAGE sql STABLE AS $$
    SELECT COALESCE((SELECT config FROM organization_settings WHERE organization_id = $1 AND section = $3), '{}'::jsonb)
        || COALESCE((SELECT config FROM team_settings WHERE team_id = $2 AND section = $3), '{}'::jsonb)
$$;

-- +goose Down
DROP FUNCTION IF EXISTS effective_settings(uuid, uuid, text);
DROP TABLE IF EXISTS team_settings;
