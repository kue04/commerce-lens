CREATE TABLE app.feedback (
 feedback_id text PRIMARY KEY,report_id text NOT NULL REFERENCES app.reports,
 owner_id text NOT NULL,store_id text NOT NULL,rating integer NOT NULL CHECK(rating BETWEEN 1 AND 5),
 issue_type text NOT NULL CHECK(issue_type IN ('correct','metric','evidence','explanation','other')),
 comment text NOT NULL CHECK(length(comment)<=1000),created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT,DELETE ON app.feedback TO commerce_app;
CREATE INDEX ON app.feedback(owner_id,store_id,report_id);
