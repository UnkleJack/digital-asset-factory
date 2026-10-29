-- Image tournament system for DesignArena-style 4-way model battles
CREATE TABLE tournaments (
  id TEXT PRIMARY KEY,
  prompt TEXT NOT NULL,
  entries TEXT NOT NULL DEFAULT '[]',
  rankings TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);
CREATE INDEX tournaments_created ON tournaments(created_at);

CREATE TABLE tournament_entries (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  model_id TEXT NOT NULL,
  model_label TEXT NOT NULL,
  prompt TEXT NOT NULL,
  result_png BLOB,
  width_px INTEGER,
  height_px INTEGER,
  error TEXT,
  latency_ms INTEGER NOT NULL,
  cost_usd REAL,
  prompt_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX tournament_entries_tournament ON tournament_entries(tournament_id);
CREATE INDEX tournament_entries_model ON tournament_entries(model_id);