-- Notes for the AI. Every review note stays forever; the AI reads them all now and then and writes
-- a short list of repeat problems and preferences ("lessons") that goes into every AI prompt.

-- Free notes on a version, written on the Rework page (not tied to a decision).
CREATE TABLE review_notes (
  id TEXT PRIMARY KEY,
  version_id TEXT NOT NULL REFERENCES product_versions(id) ON DELETE CASCADE,
  notes TEXT NOT NULL,
  created_by TEXT NOT NULL DEFAULT 'user',
  created_at TEXT NOT NULL
);
CREATE INDEX review_notes_version ON review_notes(version_id);
CREATE INDEX review_notes_at ON review_notes(created_at);

-- The repeat-problems list. source 'ai' rows are replaced at each read-through unless pinned;
-- 'user' rows (written or edited by the owner) are never replaced.
CREATE TABLE note_lessons (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  times INTEGER NOT NULL DEFAULT 1,
  source TEXT NOT NULL CHECK (source IN ('ai','user')),
  pinned INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Each read-through of the notes.
CREATE TABLE note_digests (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('running','succeeded','failed')),
  started_by TEXT NOT NULL CHECK (started_by IN ('auto','manual')),
  notes_read INTEGER NOT NULL DEFAULT 0,
  lessons INTEGER NOT NULL DEFAULT 0,
  error TEXT
);
