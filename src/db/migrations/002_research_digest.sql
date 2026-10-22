-- Research digest: one row per run of the recurring best-sellers / competitors / ideas email.
CREATE TABLE digest_runs (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('running','sent','failed')),
  trigger TEXT NOT NULL CHECK (trigger IN ('schedule','manual')),
  bestsellers TEXT NOT NULL DEFAULT '[]',
  competitors TEXT NOT NULL DEFAULT '[]',
  candidate_ideas TEXT NOT NULL DEFAULT '[]',
  vetted_ideas TEXT NOT NULL DEFAULT '[]',
  final_ideas TEXT NOT NULL DEFAULT '[]',
  search_queries INTEGER NOT NULL DEFAULT 0,
  generation_run_ids TEXT NOT NULL DEFAULT '[]',
  email_sent_at TEXT,
  email_message_id TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  finished_at TEXT
);
CREATE INDEX digest_runs_created ON digest_runs(created_at);
