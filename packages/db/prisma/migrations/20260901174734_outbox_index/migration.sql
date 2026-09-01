-- The relay polls for due, undispatched rows every second and claims them with
-- FOR UPDATE SKIP LOCKED. A partial index keeps that query touching only the
-- live backlog rather than the full history of everything ever dispatched.
CREATE INDEX "outbox_events_pending_due"
  ON "outbox_events" ("available_at")
  WHERE "status" = 'PENDING';
