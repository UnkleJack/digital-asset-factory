-- Ideas from the owner's ChatGPT review (2026-11-17), built together:
--
--   brief_fields   A short structured brief per product: who it is for, the problem it solves, what makes it
--                  different. It is added to the same AI instructions as the free-text brief (011).
--   license_tier   Which license ships with the product: 'personal' (the original), 'classroom' or 'commercial'.
--                  The wording of each lives in Settings; the product only records which one it uses.
--   research_holds "Hold for research" on Batch approval: parks a finished version until the owner has found
--                  out what they wanted to know. It is not a decision and not a rejection, so nothing is
--                  invalidated and nothing is learned from it. Released by hand, or by deciding.
--   product_lifecycle  Marks a dated product as one that never expires ("evergreen"), so the yearly
--                  new-edition reminder leaves it alone.

ALTER TABLE product_specs ADD COLUMN brief_fields TEXT NOT NULL DEFAULT '{}';
ALTER TABLE product_specs ADD COLUMN license_tier TEXT NOT NULL DEFAULT 'personal' CHECK (license_tier IN ('personal','classroom','commercial'));

CREATE TABLE research_holds (
  version_id TEXT PRIMARY KEY REFERENCES product_versions(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  held_by TEXT NOT NULL DEFAULT 'user',
  held_at TEXT NOT NULL
);

CREATE TABLE product_lifecycle (
  product_id TEXT PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  evergreen INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
