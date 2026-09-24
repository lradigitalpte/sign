-- +goose Up
CREATE TABLE user_signature_preferences (
    user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    signature_ciphertext bytea,
    initials_ciphertext bytea,
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- +goose Down
DROP TABLE IF EXISTS user_signature_preferences;
