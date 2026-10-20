-- +goose Up
-- Plan limits (seats, Free's monthly sends, plan-only features) are only enforced where this flag is on.
-- It starts off for everyone; Signet staff turn it on per workspace to test, then for everyone.
INSERT INTO feature_flags (key, description, enabled)
VALUES ('plan-enforcement', 'Enforce plan limits: sender seats, Free''s 3 sends a month, and features above the workspace''s plan.', false)
ON CONFLICT (key) DO NOTHING;

-- +goose Down
DELETE FROM feature_flags WHERE key = 'plan-enforcement';
