-- Invariants the Prisma schema language cannot express.
--
-- These are rules the design depends on, so they live in the database rather
-- than in application code that has to remember to check.

-- ---------------------------------------------------------------------------
-- One ACTIVE application per candidate per requisition.
--
-- A plain UNIQUE would be wrong: it would also block a candidate from
-- re-applying after being rejected, which is a policy decision (a cooldown that
-- flags for a recruiter) rather than a database invariant. Making the index
-- partial says exactly what we mean — you may re-apply, but you may not hold
-- two live applications for the same role at once.
--
-- This is also what turns a double-submitted form into a clean 409 rather than
-- a duplicate row, without the application code racing itself.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX "applications_one_active_per_candidate_job"
  ON "applications" ("candidate_id", "job_id")
  WHERE "status" = 'ACTIVE';

-- Applications with no recent movement are the stagnation query's target, and
-- it only ever looks at live ones.
CREATE INDEX "applications_active_last_activity"
  ON "applications" ("last_activity_at")
  WHERE "status" = 'ACTIVE';

-- Tag-style filtering over the denormalized skills array.
CREATE INDEX "candidates_skills_gin" ON "candidates" USING GIN ("skills");
