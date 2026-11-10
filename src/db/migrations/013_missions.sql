-- HAPPY DAFFY missions: one mission per chapter of the walkthrough guide, for learning the whole suite.
-- A row here means the owner marked that mission done. Removing the row puts it back on the list.
-- Numbered 013: 011 is the product brief and 012 is the review-note queue.

CREATE TABLE arcade_missions_done (
  mission_id TEXT PRIMARY KEY,
  completed_at TEXT NOT NULL
);
