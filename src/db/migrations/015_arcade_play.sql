-- HAPPY DAFFY milestones 3 to 9: the play loop on top of worlds (007).
-- Number 014 is taken by tags on imports (014_reference_tags.sql), which reached the owner's Mac first.
--
-- task_products   M3  Which factory products a task made (asset association; spec C5).
-- arcade_reviews  M4  One row per QA Review decision in the arcade, with how long it took (spec C7).
-- arcade_bin      M4  Items sent to the bin from QA Review (spec B12). The product row stays, archived.
-- credit_ledger   M4+ Earned credits (spec C8, H1 option 1): kept apart from provider headroom, never added to it.
-- pack_pool       M5  Packs the owner finalized into the pool (spec H14 option 3).
-- xp_events       M7  Exploration XP, one row per thing learned, per character (spec C12, H11 option 1).
-- laziness_state  M9  The failsafe's running score (spec C10); one row.

CREATE TABLE task_products (
  task_id TEXT NOT NULL REFERENCES world_tasks(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (task_id, product_id)
);
CREATE INDEX task_products_product ON task_products(product_id);

CREATE TABLE arcade_reviews (
  id TEXT PRIMARY KEY,
  product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
  version_id TEXT REFERENCES product_versions(id) ON DELETE SET NULL,
  -- Kept as text so the record survives a permanent delete of the product.
  product_title TEXT NOT NULL,
  product_type TEXT NOT NULL,
  task_id TEXT REFERENCES world_tasks(id) ON DELETE SET NULL,
  character_id TEXT,
  outcome TEXT NOT NULL CHECK (outcome IN ('APPROVE','REJECT','DELETE_BIN','DELETE_PERMANENT')),
  -- REJECT only: 'checked' passed the specificity check, 'waiting' is in line for the AI, 'refused' failed it later.
  reason_status TEXT CHECK (reason_status IN ('checked','waiting','refused')),
  reason_queue_id TEXT,
  liked_note TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL DEFAULT '',
  checklist TEXT NOT NULL DEFAULT '[]',
  -- 1 only for a REJECT whose reason passed every check. DELETE never qualifies (spec, locked).
  qualifying INTEGER NOT NULL DEFAULT 0,
  friction_stage INTEGER NOT NULL DEFAULT 0,
  opened_at TEXT NOT NULL,
  decided_at TEXT NOT NULL,
  duration_ms INTEGER NOT NULL
);
CREATE INDEX arcade_reviews_outcome ON arcade_reviews(outcome, decided_at);

CREATE TABLE arcade_bin (
  product_id TEXT PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  review_id TEXT REFERENCES arcade_reviews(id) ON DELETE SET NULL,
  previous_status TEXT NOT NULL,
  binned_at TEXT NOT NULL
);

CREATE TABLE credit_ledger (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('rejection_reward','pack_bonus')),
  amount INTEGER NOT NULL,
  -- One award per threshold reached, e.g. 'rejections:10' or 'packs:3', so nothing is paid twice.
  award_key TEXT NOT NULL UNIQUE,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE pack_pool (
  bundle_product_id TEXT PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  cart_id TEXT REFERENCES pack_carts(id) ON DELETE SET NULL,
  items INTEGER NOT NULL,
  finalized_at TEXT NOT NULL
);
CREATE INDEX pack_pool_finalized ON pack_pool(finalized_at);

CREATE TABLE xp_events (
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL CHECK (character_id IN ('ide','ai-chatbot','daf')),
  kind TEXT NOT NULL CHECK (kind IN ('task','tab','cross_tab')),
  difficulty TEXT CHECK (difficulty IN ('LOW','MEDIUM','HIGH')),
  -- What was learned: a world task id, a tab name, or a pair of tabs. Unique per character, so no double awards.
  subject TEXT NOT NULL,
  label TEXT NOT NULL,
  -- Blank (NULL) while the owner has not set an XP value for this kind (spec D6: never invented).
  xp INTEGER,
  created_at TEXT NOT NULL,
  UNIQUE (character_id, kind, subject)
);

CREATE TABLE laziness_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  score REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
