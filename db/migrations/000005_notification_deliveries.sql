-- +goose Up
ALTER TABLE notification_jobs ADD COLUMN sent_at timestamptz;

CREATE TABLE notification_deliveries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id uuid NOT NULL REFERENCES notification_jobs(id) ON DELETE CASCADE,
    attempt integer NOT NULL,
    status text NOT NULL CHECK (status IN ('sent', 'failed')),
    provider text NOT NULL,
    provider_message_id text,
    error text,
    occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notification_deliveries_job_idx ON notification_deliveries (job_id, occurred_at);

-- +goose Down
DROP TABLE IF EXISTS notification_deliveries;
ALTER TABLE notification_jobs DROP COLUMN IF EXISTS sent_at;
