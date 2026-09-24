-- +goose Up
CREATE TABLE envelope_operations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    envelope_id uuid NOT NULL REFERENCES envelopes(id) ON DELETE CASCADE,
    idempotency_key text NOT NULL,
    operation text NOT NULL,
    response jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (envelope_id, operation, idempotency_key)
);

CREATE TABLE notification_jobs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    envelope_id uuid NOT NULL REFERENCES envelopes(id) ON DELETE CASCADE,
    recipient_id uuid NOT NULL REFERENCES recipients(id) ON DELETE CASCADE,
    kind text NOT NULL,
    token_ciphertext bytea NOT NULL,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed')),
    attempts integer NOT NULL DEFAULT 0,
    available_at timestamptz NOT NULL DEFAULT now(),
    last_error text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notification_jobs_pending_idx ON notification_jobs (available_at, created_at) WHERE status IN ('pending', 'failed');

-- +goose Down
DROP TABLE IF EXISTS notification_jobs;
DROP TABLE IF EXISTS envelope_operations;
