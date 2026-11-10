-- Review notes that are waiting for the AI to check them. Every note goes through the AI; when it can't be
-- reached, the note and the action it belongs to (reject, send back, Rework note, lesson) wait here and
-- are retried every 60 seconds once the AI is back. Nothing happens to the item until the note passes.
CREATE TABLE reason_queue (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,                 -- rejected | revision_requested | regenerate_requested | note | lesson
  action TEXT NOT NULL,               -- JSON: what to do once the note passes
  text TEXT NOT NULL,
  target TEXT,                        -- batch item, version or lesson id, for showing and de-duplicating
  title TEXT,                         -- product title, for showing
  status TEXT NOT NULL CHECK (status IN ('waiting','applied','refused','failed','dismissed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  message TEXT,                       -- the AI's reason when refused, or the error when applying failed
  created_at TEXT NOT NULL,
  next_try_at TEXT NOT NULL,
  finished_at TEXT
);
CREATE INDEX reason_queue_status ON reason_queue(status, next_try_at);
