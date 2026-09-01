-- CreateEnum
CREATE TYPE "actor_types" AS ENUM ('USER', 'SYSTEM', 'CANDIDATE');

-- CreateEnum
CREATE TYPE "application_event_types" AS ENUM ('APPLICATION_RECEIVED', 'STAGE_CHANGED', 'REJECTED', 'WITHDRAWN', 'HIRED', 'REOPENED', 'NOTE_ADDED', 'RESUME_PARSED', 'RESUME_PARSE_FAILED', 'MARKED_STAGNANT');

-- DropIndex
DROP INDEX "candidates_skills_gin";

-- CreateTable
CREATE TABLE "application_events" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "type" "application_event_types" NOT NULL,
    "from_stage_id" UUID,
    "to_stage_id" UUID,
    "actor_type" "actor_types" NOT NULL DEFAULT 'USER',
    "actor_id" UUID,
    "reason" TEXT,
    "metadata" JSONB,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "application_events_application_id_occurred_at_idx" ON "application_events"("application_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "application_events_application_id_seq_key" ON "application_events"("application_id", "seq");

-- AddForeignKey
ALTER TABLE "application_events" ADD CONSTRAINT "application_events_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_events" ADD CONSTRAINT "application_events_from_stage_id_fkey" FOREIGN KEY ("from_stage_id") REFERENCES "job_stages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_events" ADD CONSTRAINT "application_events_to_stage_id_fkey" FOREIGN KEY ("to_stage_id") REFERENCES "job_stages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_events" ADD CONSTRAINT "application_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
