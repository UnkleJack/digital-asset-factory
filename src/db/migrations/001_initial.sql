-- Digital Asset Factory initial schema. Timestamps are ISO-8601 UTC strings; JSON columns hold validated JSON text.

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  at TEXT NOT NULL,
  actor TEXT NOT NULL CHECK (actor IN ('user','system','scheduler','worker')),
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  details TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX audit_events_entity ON audit_events(entity_type, entity_id);
CREATE INDEX audit_events_at ON audit_events(at);

-- Reusable taxonomy and design assets -------------------------------------------------

CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT ''
);

CREATE TABLE audiences (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  profile TEXT NOT NULL DEFAULT '{}',
  is_builtin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE themes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  keywords TEXT NOT NULL DEFAULT '[]',
  seasonal_months TEXT NOT NULL DEFAULT '[]',
  is_builtin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE design_systems (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  tokens TEXT NOT NULL,
  is_builtin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE templates (
  id TEXT PRIMARY KEY,
  product_type TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  default_params TEXT NOT NULL DEFAULT '{}',
  default_design_system_id TEXT REFERENCES design_systems(id),
  is_builtin INTEGER NOT NULL DEFAULT 0,
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (product_type, name)
);

-- Research and opportunities ----------------------------------------------------------

CREATE TABLE keywords (
  id TEXT PRIMARY KEY,
  phrase TEXT NOT NULL UNIQUE COLLATE NOCASE,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE opportunities (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  product_type TEXT NOT NULL,
  category_id TEXT REFERENCES categories(id),
  audience_id TEXT REFERENCES audiences(id),
  theme_id TEXT REFERENCES themes(id),
  keyword_ids TEXT NOT NULL DEFAULT '[]',
  seasonal_months TEXT NOT NULL DEFAULT '[]',
  differentiation_note TEXT NOT NULL DEFAULT '',
  inputs TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','evaluating','approved','rejected','produced','archived')),
  origin TEXT NOT NULL CHECK (origin IN ('manual','csv_import','ai_suggestion')),
  origin_details TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX opportunities_status ON opportunities(status);

CREATE TABLE research_observations (
  id TEXT PRIMARY KEY,
  keyword_id TEXT REFERENCES keywords(id) ON DELETE SET NULL,
  opportunity_id TEXT REFERENCES opportunities(id) ON DELETE CASCADE,
  marketplace TEXT,
  metric TEXT NOT NULL,
  value_num REAL,
  value_text TEXT,
  unit TEXT,
  evidence_kind TEXT NOT NULL CHECK (evidence_kind IN ('measured','external_estimate','model_hypothesis','unknown')),
  source TEXT NOT NULL,
  source_detail TEXT NOT NULL DEFAULT '',
  observed_at TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  import_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX research_observations_opp ON research_observations(opportunity_id);
CREATE INDEX research_observations_kw ON research_observations(keyword_id);

CREATE TABLE opportunity_scores (
  id TEXT PRIMARY KEY,
  opportunity_id TEXT NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  score REAL,
  confidence REAL NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('meets_threshold','below_threshold','insufficient_evidence','policy_blocked')),
  factors TEXT NOT NULL,
  weights TEXT NOT NULL,
  thresholds TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX opportunity_scores_opp ON opportunity_scores(opportunity_id, created_at);

-- Products, specifications, versions, assets -------------------------------------------

CREATE TABLE products (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  product_type TEXT NOT NULL,
  category_id TEXT REFERENCES categories(id),
  audience_id TEXT REFERENCES audiences(id),
  theme_id TEXT REFERENCES themes(id),
  opportunity_id TEXT REFERENCES opportunities(id) ON DELETE SET NULL,
  template_id TEXT REFERENCES templates(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived','retired')),
  current_version_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX products_type ON products(product_type);

CREATE TABLE product_specs (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  product_type TEXT NOT NULL,
  params TEXT NOT NULL,
  design_system_id TEXT NOT NULL REFERENCES design_systems(id),
  audience_id TEXT REFERENCES audiences(id),
  theme_id TEXT REFERENCES themes(id),
  paper TEXT NOT NULL,
  seed INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE product_versions (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  version_no INTEGER NOT NULL,
  spec_id TEXT NOT NULL REFERENCES product_specs(id),
  parent_version_id TEXT REFERENCES product_versions(id),
  origin TEXT NOT NULL CHECK (origin IN ('initial','regenerate','revision','edit','variation')),
  change_note TEXT NOT NULL DEFAULT '',
  revision_notes TEXT NOT NULL DEFAULT '',
  stage TEXT NOT NULL DEFAULT 'specified',
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','ready','failed','qa_failed','superseded','rejected','approved')),
  content TEXT,
  content_provenance TEXT,
  deliverable_hash TEXT,
  qa_status TEXT NOT NULL DEFAULT 'pending' CHECK (qa_status IN ('pending','passed','passed_with_warnings','failed')),
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (product_id, version_no)
);
CREATE INDEX product_versions_status ON product_versions(status);

CREATE TABLE generation_runs (
  id TEXT PRIMARY KEY,
  version_id TEXT REFERENCES product_versions(id) ON DELETE CASCADE,
  job_id TEXT,
  plan_run_id TEXT,
  purpose TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT,
  prompt_hash TEXT,
  settings TEXT NOT NULL DEFAULT '{}',
  input_tokens INTEGER,
  output_tokens INTEGER,
  image_count INTEGER,
  cost_usd REAL,
  cost_basis TEXT NOT NULL DEFAULT 'none' CHECK (cost_basis IN ('none','estimate_from_price_table','unknown')),
  status TEXT NOT NULL CHECK (status IN ('succeeded','failed')),
  error TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL
);
CREATE INDEX generation_runs_version ON generation_runs(version_id);
CREATE INDEX generation_runs_plan ON generation_runs(plan_run_id);

CREATE TABLE assets (
  id TEXT PRIMARY KEY,
  product_id TEXT REFERENCES products(id) ON DELETE CASCADE,
  version_id TEXT REFERENCES product_versions(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('deliverable','preview','listing_image','source','internal','export')),
  rel_path TEXT NOT NULL UNIQUE,
  mime TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  page_count INTEGER,
  page_index INTEGER,
  width_pt REAL,
  height_pt REAL,
  width_px INTEGER,
  height_px INTEGER,
  provenance TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX assets_version ON assets(version_id, role);
CREATE INDEX assets_sha ON assets(sha256);

CREATE TABLE product_relationships (
  id TEXT PRIMARY KEY,
  from_product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  to_product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('variation_of','shares_template','related','merge_candidate','bundle_member')),
  details TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  UNIQUE (from_product_id, to_product_id, kind)
);

CREATE TABLE bundle_items (
  bundle_product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  member_product_id TEXT NOT NULL REFERENCES products(id),
  position INTEGER NOT NULL,
  PRIMARY KEY (bundle_product_id, member_product_id)
);

-- Quality assurance --------------------------------------------------------------------

CREATE TABLE qa_runs (
  id TEXT PRIMARY KEY,
  version_id TEXT NOT NULL REFERENCES product_versions(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('running','passed','passed_with_warnings','failed','error')),
  hard_failures INTEGER NOT NULL DEFAULT 0,
  warnings INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL,
  finished_at TEXT
);
CREATE INDEX qa_runs_version ON qa_runs(version_id, started_at);

CREATE TABLE qa_results (
  id TEXT PRIMARY KEY,
  qa_run_id TEXT NOT NULL REFERENCES qa_runs(id) ON DELETE CASCADE,
  check_code TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('hard','warning')),
  passed INTEGER NOT NULL,
  message TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX qa_results_run ON qa_results(qa_run_id);

-- Marketplaces and listings ------------------------------------------------------------

CREATE TABLE marketplace_accounts (
  id TEXT PRIMARY KEY,
  marketplace TEXT NOT NULL,
  label TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('export_only','connected','needs_reauth','disconnected')),
  shop_ref TEXT,
  secret_ref TEXT,
  connected_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE listings (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  version_id TEXT NOT NULL REFERENCES product_versions(id) ON DELETE CASCADE,
  marketplace TEXT NOT NULL,
  account_id TEXT REFERENCES marketplace_accounts(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '[]',
  price_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  attributes TEXT NOT NULL DEFAULT '{}',
  image_asset_ids TEXT NOT NULL DEFAULT '[]',
  file_asset_ids TEXT NOT NULL DEFAULT '[]',
  listing_hash TEXT NOT NULL,
  provenance TEXT NOT NULL DEFAULT '{}',
  validation TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','invalid','ready','export_prepared','published_manual','published_verified','needs_reconciliation','failed','retired')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (version_id, marketplace)
);
CREATE INDEX listings_product ON listings(product_id);

-- Approval -------------------------------------------------------------------------------

CREATE TABLE approval_batches (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  origin TEXT NOT NULL CHECK (origin IN ('scheduler','manual')),
  plan_run_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('collecting','ready_for_review','closed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  closed_at TEXT
);

CREATE TABLE approval_items (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES approval_batches(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  version_id TEXT NOT NULL REFERENCES product_versions(id) ON DELETE CASCADE,
  added_at TEXT NOT NULL,
  UNIQUE (batch_id, version_id)
);

CREATE TABLE approval_decisions (
  id TEXT PRIMARY KEY,
  item_id TEXT REFERENCES approval_items(id) ON DELETE SET NULL,
  version_id TEXT NOT NULL REFERENCES product_versions(id) ON DELETE CASCADE,
  listing_id TEXT REFERENCES listings(id) ON DELETE CASCADE,
  marketplace TEXT,
  decision TEXT NOT NULL CHECK (decision IN ('approved','rejected','revision_requested','regenerate_requested')),
  fingerprint TEXT,
  notes TEXT NOT NULL DEFAULT '',
  decided_by TEXT NOT NULL,
  decided_at TEXT NOT NULL,
  invalidated_at TEXT,
  invalidated_reason TEXT
);
CREATE INDEX approval_decisions_listing ON approval_decisions(listing_id);
CREATE INDEX approval_decisions_version ON approval_decisions(version_id);

-- Publishing -------------------------------------------------------------------------------

CREATE TABLE publication_attempts (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  operation TEXT NOT NULL CHECK (operation IN ('prepare_export','publish','update','record_manual','reconcile')),
  idempotency_key TEXT NOT NULL,
  approval_decision_id TEXT REFERENCES approval_decisions(id),
  adapter TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('started','succeeded','failed','unknown')),
  request_summary TEXT NOT NULL DEFAULT '{}',
  response_summary TEXT NOT NULL DEFAULT '{}',
  error TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT
);
CREATE UNIQUE INDEX publication_attempts_idem ON publication_attempts(idempotency_key) WHERE status IN ('started','succeeded','unknown');
CREATE INDEX publication_attempts_listing ON publication_attempts(listing_id);

CREATE TABLE external_listings (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  marketplace TEXT NOT NULL,
  external_id TEXT,
  external_url TEXT,
  verification TEXT NOT NULL CHECK (verification IN ('api_verified','manual_unverified')),
  state TEXT NOT NULL DEFAULT 'unknown' CHECK (state IN ('active','draft','inactive','removed','unknown')),
  last_reconciled_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX external_listings_ext ON external_listings(marketplace, external_id) WHERE external_id IS NOT NULL;

-- Analytics -------------------------------------------------------------------------------

CREATE TABLE data_imports (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  filename TEXT NOT NULL,
  rows_total INTEGER NOT NULL,
  rows_imported INTEGER NOT NULL,
  rows_rejected INTEGER NOT NULL,
  errors TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);

CREATE TABLE performance_observations (
  id TEXT PRIMARY KEY,
  listing_id TEXT REFERENCES listings(id) ON DELETE SET NULL,
  product_id TEXT REFERENCES products(id) ON DELETE CASCADE,
  marketplace TEXT,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  metric TEXT NOT NULL CHECK (metric IN ('views','favorites','orders','units','revenue_cents','refunds')),
  value REAL NOT NULL,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('marketplace_api','csv_import','manual_entry','estimate')),
  source_detail TEXT NOT NULL DEFAULT '',
  import_id TEXT REFERENCES data_imports(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);
CREATE INDEX performance_observations_product ON performance_observations(product_id, metric);

CREATE TABLE recommendations (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('produce_more','improve_template','create_bundle','retire_product','run_experiment')),
  title TEXT NOT NULL,
  rationale TEXT NOT NULL,
  evidence TEXT NOT NULL,
  confidence REAL NOT NULL,
  subject_type TEXT,
  subject_id TEXT,
  fingerprint TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','accepted','dismissed')),
  created_at TEXT NOT NULL,
  decided_at TEXT
);
CREATE UNIQUE INDEX recommendations_open ON recommendations(fingerprint) WHERE status = 'open';

-- Jobs and scheduling ------------------------------------------------------------------

CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued','running','succeeded','failed','cancelled')),
  dedupe_key TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  priority INTEGER NOT NULL DEFAULT 100,
  run_after TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  lease_owner TEXT,
  lease_expires_at TEXT,
  last_error TEXT,
  error_class TEXT,
  result TEXT,
  product_id TEXT,
  version_id TEXT,
  plan_run_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  finished_at TEXT
);
CREATE UNIQUE INDEX jobs_active_dedupe ON jobs(dedupe_key) WHERE status IN ('queued','running');
CREATE INDEX jobs_claim ON jobs(status, run_after, priority);
CREATE INDEX jobs_version ON jobs(version_id);

CREATE TABLE job_attempts (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  attempt_no INTEGER NOT NULL,
  worker TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  outcome TEXT CHECK (outcome IN ('succeeded','failed_transient','failed_permanent','interrupted','cancelled')),
  error TEXT,
  error_class TEXT,
  duration_ms INTEGER
);
CREATE INDEX job_attempts_job ON job_attempts(job_id);

CREATE TABLE production_plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0,
  run_at TEXT NOT NULL,
  days_of_week TEXT NOT NULL DEFAULT '[0,1,2,3,4,5,6]',
  quota INTEGER NOT NULL,
  per_category_max INTEGER NOT NULL,
  category_rotation TEXT NOT NULL DEFAULT '[]',
  product_types TEXT NOT NULL DEFAULT '[]',
  marketplaces TEXT NOT NULL DEFAULT '["etsy"]',
  max_cost_usd REAL NOT NULL,
  min_score REAL NOT NULL,
  min_confidence REAL NOT NULL,
  rotation_cursor INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE plan_runs (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES production_plans(id) ON DELETE CASCADE,
  slot TEXT NOT NULL,
  trigger TEXT NOT NULL CHECK (trigger IN ('schedule','catch_up','manual')),
  status TEXT NOT NULL CHECK (status IN ('pending','running','completed','partial','failed','missed')),
  batch_id TEXT REFERENCES approval_batches(id),
  products_created INTEGER NOT NULL DEFAULT 0,
  items_skipped INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '[]',
  started_at TEXT,
  finished_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (plan_id, slot)
);
