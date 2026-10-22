CREATE SCHEMA app;
CREATE TABLE app.sessions (
 session_id text PRIMARY KEY, owner_id text NOT NULL, store_id text NOT NULL,
 dataset_version text NOT NULL REFERENCES business.datasets,
 state_json jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE app.runs (
 run_id text PRIMARY KEY, session_id text NOT NULL REFERENCES app.sessions,
 owner_id text NOT NULL, store_id text NOT NULL,
 idempotency_key text NOT NULL, request_hash text NOT NULL, request_json jsonb NOT NULL,
 status text NOT NULL CHECK(status IN ('queued','running','completed','partial','needs_clarification','insufficient_data','failed','cancelled','timed_out','interrupted')),
 state_version integer NOT NULL DEFAULT 0, last_seq integer NOT NULL DEFAULT 0,
 dto jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(owner_id,idempotency_key)
);
CREATE UNIQUE INDEX one_active_run_per_session ON app.runs(session_id) WHERE status IN ('queued','running');
CREATE TABLE app.run_events (
 run_id text NOT NULL REFERENCES app.runs, seq integer NOT NULL,
 event_json jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(run_id,seq)
);
CREATE TABLE app.evidences (
 evidence_id text PRIMARY KEY, run_id text NOT NULL REFERENCES app.runs,
 owner_id text NOT NULL, store_id text NOT NULL,
 dto jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE app.reports (
 report_id text PRIMARY KEY, run_id text NOT NULL UNIQUE REFERENCES app.runs,
 owner_id text NOT NULL, store_id text NOT NULL,
 dto jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON app.sessions(owner_id,store_id,created_at DESC);
CREATE INDEX ON app.runs(owner_id,store_id,session_id);
CREATE INDEX ON app.reports(owner_id,store_id,created_at DESC);

CREATE FUNCTION app.immutable_result() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'saved evidence and report results are immutable'; END $$;
CREATE TRIGGER immutable_evidence BEFORE UPDATE ON app.evidences FOR EACH ROW EXECUTE FUNCTION app.immutable_result();
CREATE TRIGGER immutable_report BEFORE UPDATE ON app.reports FOR EACH ROW EXECUTE FUNCTION app.immutable_result();

DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='commerce_app') THEN
   CREATE ROLE commerce_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
 END IF;
END $$;
GRANT USAGE ON SCHEMA app TO commerce_app;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA app TO commerce_app;
-- Business-query login cannot read sessions; state login cannot read or write business facts.
