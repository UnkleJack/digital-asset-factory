-- HAPPY DAFFY missions: one mission per chapter of the walkthrough guide, for learning the whole suite.
-- A row here means the owner marked that mission done. Removing the row puts it back on the list.
-- Numbered 012 because open PR #26 already uses 011.

CREATE TABLE arcade_missions_done (
  mission_id TEXT PRIMARY KEY,
  completed_at TEXT NOT NULL
);
