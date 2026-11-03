-- HAPPY DAFFY worlds (spec milestone 2). A world is a project; it has ordered milestones, and
-- each task belongs to one milestone and is assigned to one character (spec H12, option 1).
-- A character only sees a world while it has at least one open task there (spec, locked).

CREATE TABLE worlds (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE world_milestones (
  id TEXT PRIMARY KEY,
  world_id TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','completed')),
  completed_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (world_id, sequence)
);

CREATE TABLE world_tasks (
  id TEXT PRIMARY KEY,
  world_id TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  milestone_id TEXT NOT NULL REFERENCES world_milestones(id) ON DELETE CASCADE,
  character_id TEXT NOT NULL CHECK (character_id IN ('ide','ai-chatbot','daf')),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  -- A registered product type id (the module that makes it), or 'custom' for any other kind of task.
  task_type TEXT NOT NULL,
  difficulty TEXT NOT NULL CHECK (difficulty IN ('LOW','MEDIUM','HIGH')),
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','IN_PROGRESS','BLOCKED','COMPLETE')),
  -- Effort points: the owner's own estimate. Ranks worlds by work left to the next milestone (spec D2/H7).
  estimated_effort REAL NOT NULL CHECK (estimated_effort > 0),
  remaining_effort REAL NOT NULL CHECK (remaining_effort >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE INDEX world_tasks_world ON world_tasks(world_id, status);
CREATE INDEX world_tasks_character ON world_tasks(character_id, status);
CREATE INDEX world_tasks_milestone ON world_tasks(milestone_id);
