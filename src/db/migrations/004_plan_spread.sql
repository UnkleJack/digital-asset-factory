-- Spreading production out: a per-plan random-but-stable offset from the set time, and which
-- machine a plan runs on when several computers share the workload.
ALTER TABLE production_plans ADD COLUMN jitter_minutes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE production_plans ADD COLUMN run_on TEXT NOT NULL DEFAULT '';
