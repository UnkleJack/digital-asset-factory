-- World Builder drafts (owner request, 2026-11-05). What the AI writes for the World Builder (a whole
-- world, or tidied notes) is kept here until the owner saves or discards it, so leaving the page while the
-- AI works loses nothing. A draft is not a world: Worlds lists never show drafts, and SAVE WORLD is still
-- the only thing that creates a world.

CREATE TABLE world_drafts (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('world','notes')),
  status TEXT NOT NULL CHECK (status IN ('writing','ready','failed')),
  -- JSON: what the owner asked for (the goal and settings, or the raw notes).
  request TEXT NOT NULL,
  -- JSON: the AI's answer once it arrives.
  result TEXT,
  error TEXT,
  model TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX world_drafts_kind ON world_drafts(kind, created_at);
CREATE INDEX world_drafts_status ON world_drafts(status);
