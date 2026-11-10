-- B.M.O. saved ideas (owner request, 2026-11-10): a suggestion the owner liked but isn't ready to act on.
-- Only a suggestion B.M.O. actually made can be saved (it must still be waiting for an answer), and
-- DO IT runs the action stored here, once, so a client can't save an action of its own.
CREATE TABLE bmo_saved_ideas (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('create_world','add_task','make_product')),
  action TEXT NOT NULL,
  why TEXT NOT NULL DEFAULT '',
  saved_at TEXT NOT NULL
);
