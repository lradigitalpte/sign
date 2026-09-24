-- +goose Up
ALTER TABLE users ADD COLUMN avatar_data_url text;

-- +goose Down
ALTER TABLE users DROP COLUMN avatar_data_url;
