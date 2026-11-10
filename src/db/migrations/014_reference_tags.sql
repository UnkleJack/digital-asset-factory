-- Tags on imported items, so incoming pictures and text sort into groups of like things
-- (fonts, mandalas, calendars...). One item can carry many tags: a font picture can be
-- tagged both "fonts" and "art" and show up under either. Tags are lower-case slugs.
CREATE TABLE reference_tags (
  reference_id TEXT NOT NULL REFERENCES reference_items(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  PRIMARY KEY (reference_id, tag)
);
CREATE INDEX reference_tags_tag ON reference_tags(tag);
