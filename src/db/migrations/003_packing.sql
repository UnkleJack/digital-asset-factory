-- Pack carts: finished products flow onto up to N open "carts", each building one pack (bundle).
-- A product can carry many tags and sit in several carts at once; what fits no open cart waits
-- in the backlog until the factory takes a break.

CREATE TABLE product_tags (
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('category','theme','audience','season','style','type','custom')),
  source TEXT NOT NULL CHECK (source IN ('derived','user','ai')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (product_id, kind, tag)
);
CREATE INDEX product_tags_tag ON product_tags(tag);

CREATE TABLE pack_carts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL CHECK (status IN ('open','built','dissolved')),
  origin TEXT NOT NULL CHECK (origin IN ('conveyor','backlog','variety','remix','manual')),
  slot INTEGER,
  target_size INTEGER NOT NULL,
  min_size INTEGER NOT NULL,
  bundle_product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  closed_at TEXT
);
CREATE INDEX pack_carts_status ON pack_carts(status);

CREATE TABLE pack_cart_items (
  cart_id TEXT NOT NULL REFERENCES pack_carts(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  score REAL NOT NULL,
  added_at TEXT NOT NULL,
  PRIMARY KEY (cart_id, product_id)
);
CREATE INDEX pack_cart_items_product ON pack_cart_items(product_id);

CREATE TABLE packing_backlog (
  product_id TEXT PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  passes INTEGER NOT NULL DEFAULT 1,
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
