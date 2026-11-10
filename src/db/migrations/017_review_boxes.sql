-- Boxes drawn on a page preview when rejecting, returning for revision or regenerating (owner's back-burner
-- item, built 2026-11-10). Each box is a direct visual reference attached to the review note: which page,
-- and where on it, as fractions of the page (0 to 1) so it fits any preview size.
-- The cut-out of the boxed area and a copy of the page with the box drawn on it are kept under
-- review-boxes/ in the asset folder. A picture-reading AI (Settings, AI providers) describes what is in the
-- box; until one is set, or while it can't be reached, the box waits with vision_status 'waiting'.
CREATE TABLE review_boxes (
  id TEXT PRIMARY KEY,
  version_id TEXT NOT NULL,
  preview_asset_id TEXT NOT NULL,
  page INTEGER NOT NULL,
  x REAL NOT NULL CHECK (x >= 0 AND x <= 1),
  y REAL NOT NULL CHECK (y >= 0 AND y <= 1),
  w REAL NOT NULL CHECK (w > 0 AND w <= 1),
  h REAL NOT NULL CHECK (h > 0 AND h <= 1),
  -- The review decision this box belongs to. NULL while the note waits for the AI check (reason_queue),
  -- and for good if that note is refused.
  decision_id TEXT,
  crop_path TEXT,
  marked_path TEXT,
  description TEXT,
  vision_status TEXT NOT NULL DEFAULT 'waiting' CHECK (vision_status IN ('waiting','described','failed')),
  vision_provider TEXT,
  vision_model TEXT,
  vision_error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_try_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  described_at TEXT
);
CREATE INDEX review_boxes_version ON review_boxes (version_id);
CREATE INDEX review_boxes_decision ON review_boxes (decision_id);
CREATE INDEX review_boxes_waiting ON review_boxes (vision_status, next_try_at);
