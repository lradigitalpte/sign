-- +goose Up
-- Every API and worker process writes a row here every 30 seconds, so the admin System page can tell
-- which processes are alive, including workers the API can't reach directly.
CREATE TABLE service_instances (
    id text PRIMARY KEY,
    service text NOT NULL CHECK (service IN ('api', 'worker')),
    -- What the process does besides its main job, e.g. 'email' when the API runs the embedded worker.
    roles text[] NOT NULL DEFAULT '{}',
    hostname text NOT NULL,
    pid integer NOT NULL,
    version text NOT NULL DEFAULT '',
    started_at timestamptz NOT NULL,
    last_seen_at timestamptz NOT NULL,
    goroutines integer NOT NULL DEFAULT 0,
    memory_bytes bigint NOT NULL DEFAULT 0
);
CREATE INDEX service_instances_last_seen_idx ON service_instances (last_seen_at DESC);

-- The latest run of each recurring background job, whichever process ran it.
CREATE TABLE scheduled_job_runs (
    name text PRIMARY KEY,
    interval_seconds integer NOT NULL,
    last_started_at timestamptz NOT NULL,
    last_finished_at timestamptz NOT NULL,
    last_duration_ms integer NOT NULL,
    last_success_at timestamptz,
    last_error text,
    last_error_at timestamptz,
    last_instance text NOT NULL,
    runs bigint NOT NULL DEFAULT 0,
    failures bigint NOT NULL DEFAULT 0
);

-- +goose Down
DROP TABLE IF EXISTS scheduled_job_runs;
DROP TABLE IF EXISTS service_instances;
