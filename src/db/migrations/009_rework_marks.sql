-- The Rework page lists work that was rejected, returned for revision, regenerated, or failed in the
-- factory. An item stays there until the owner presses "Mark fixed", which records a row here.
-- Removing the row puts the item back. Nothing is deleted: the version and its history stay as they are.
-- Numbered 009 because open PR #13 already uses 008.

CREATE TABLE rework_marks (
  version_id TEXT PRIMARY KEY REFERENCES product_versions(id) ON DELETE CASCADE,
  marked_at TEXT NOT NULL,
  marked_by TEXT NOT NULL DEFAULT 'user'
);
