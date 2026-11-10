-- HAPPY DAFFY mission reports (owner, 2026-11-10). Some missions are cleared by trying the feature and
-- writing back how it went, not by pressing MARK DONE: "man with machine". Each report names the product
-- it was about, and its text is also filed as a note for the AI on that product (review_notes), so the
-- factory learns from it. part_id is '' for a one-part mission, or the part's id for a multi-part one.
-- UNDO on the mission deletes its reports here; the notes for the AI stay.

CREATE TABLE arcade_mission_reports (
  mission_id TEXT NOT NULL,
  part_id TEXT NOT NULL DEFAULT '',
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  report TEXT NOT NULL,
  note_id TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (mission_id, part_id)
);
