-- Readable asset folders: each product version gets a folder named after what it is, e.g.
-- products/coloring-pages/intricate-mandala-coloring-pages_2026-10-28. NULL means the version
-- has not been given a folder yet (it is chosen the first time files are written, or by
-- `npm run tidy-folders` for versions written under the old products/<id>/v<n> layout).
ALTER TABLE product_versions ADD COLUMN asset_dir TEXT;
CREATE UNIQUE INDEX product_versions_asset_dir ON product_versions(asset_dir) WHERE asset_dir IS NOT NULL;

-- Things made outside the Factory (images from Grok, ChatGPT, Gemini, arena.ai, ...; titles,
-- descriptions, tags or page text you liked). Images can become coloring-page products; text
-- marked use_as_example is shown to the AI as examples of the style you want.
CREATE TABLE reference_items (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('image','text')),
  label TEXT NOT NULL,
  field TEXT CHECK (field IS NULL OR field IN ('title','description','tags','page_text','other')),
  body TEXT,
  source_tool TEXT NOT NULL DEFAULT '',
  prompt TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  original_name TEXT NOT NULL DEFAULT '',
  rel_path TEXT UNIQUE,
  mime TEXT,
  size_bytes INTEGER,
  width_px INTEGER,
  height_px INTEGER,
  sha256 TEXT NOT NULL UNIQUE,
  use_as_example INTEGER NOT NULL DEFAULT 1,
  made_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX reference_items_kind ON reference_items(kind, created_at);
