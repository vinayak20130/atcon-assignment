-- The event log is append-only, enforced rather than merely intended.
--
-- This also makes an application impossible to hard-delete once it has history,
-- which is the behaviour we want: hiring decisions about real people should not
-- be erasable through an ORM call. TRUNCATE does not fire row-level triggers,
-- so test teardown is unaffected.
CREATE OR REPLACE FUNCTION reject_append_only_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only; % is not permitted', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER application_events_append_only
  BEFORE UPDATE OR DELETE ON "application_events"
  FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();

-- actor_id is present exactly when the actor is a user, and never otherwise.
--
-- Without this, a SYSTEM event could carry a stale user id and the audit trail
-- would attribute a nightly sweep to a person. The discriminator and the id
-- have to agree, so the database enforces it rather than the callers.
ALTER TABLE "application_events"
  ADD CONSTRAINT "actor_id_matches_actor_type"
  CHECK (("actor_type" = 'USER') = ("actor_id" IS NOT NULL));

-- Sequence numbers start at 1 and never go backwards.
ALTER TABLE "application_events"
  ADD CONSTRAINT "application_event_seq_positive" CHECK ("seq" >= 1);
