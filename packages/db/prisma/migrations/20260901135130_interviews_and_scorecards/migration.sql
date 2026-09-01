-- CreateEnum
CREATE TYPE "interview_statuses" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "recommendations" AS ENUM ('STRONG_NO', 'NO', 'YES', 'STRONG_YES');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "application_event_types" ADD VALUE 'INTERVIEW_SCHEDULED';
ALTER TYPE "application_event_types" ADD VALUE 'INTERVIEW_CANCELLED';
ALTER TYPE "application_event_types" ADD VALUE 'INTERVIEW_CONCLUDED';
ALTER TYPE "application_event_types" ADD VALUE 'SCORECARD_SUBMITTED';

-- CreateTable
CREATE TABLE "interviews" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "stage_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "scheduled_start" TIMESTAMP(3) NOT NULL,
    "scheduled_end" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "status" "interview_statuses" NOT NULL DEFAULT 'SCHEDULED',
    "booking_url" TEXT,
    "meeting_url" TEXT,
    "notes" TEXT,
    "cancellation_note" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_panelists" (
    "id" UUID NOT NULL,
    "interview_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "is_required" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "interview_panelists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scorecard_templates" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scorecard_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scorecard_criteria" (
    "id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "position" INTEGER NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "max_rating" INTEGER NOT NULL DEFAULT 5,

    CONSTRAINT "scorecard_criteria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scorecards" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "interview_id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "interviewer_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "submitted_at" TIMESTAMP(3),
    "recommendation" "recommendations",
    "summary" TEXT,
    "score" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scorecards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scorecard_ratings" (
    "id" UUID NOT NULL,
    "scorecard_id" UUID NOT NULL,
    "criterion_id" UUID NOT NULL,
    "rating" INTEGER NOT NULL,
    "notes" TEXT,

    CONSTRAINT "scorecard_ratings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "interviews_org_id_status_scheduled_start_idx" ON "interviews"("org_id", "status", "scheduled_start");

-- CreateIndex
CREATE INDEX "interviews_application_id_idx" ON "interviews"("application_id");

-- CreateIndex
CREATE INDEX "interviews_stage_id_idx" ON "interviews"("stage_id");

-- CreateIndex
CREATE INDEX "interview_panelists_user_id_idx" ON "interview_panelists"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "interview_panelists_interview_id_user_id_key" ON "interview_panelists"("interview_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "scorecard_templates_org_id_name_key" ON "scorecard_templates"("org_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "scorecard_criteria_template_id_position_key" ON "scorecard_criteria"("template_id", "position");

-- CreateIndex
CREATE INDEX "scorecards_application_id_idx" ON "scorecards"("application_id");

-- CreateIndex
CREATE UNIQUE INDEX "scorecards_interview_id_interviewer_id_key" ON "scorecards"("interview_id", "interviewer_id");

-- CreateIndex
CREATE UNIQUE INDEX "scorecard_ratings_scorecard_id_criterion_id_key" ON "scorecard_ratings"("scorecard_id", "criterion_id");

-- AddForeignKey
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "job_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_panelists" ADD CONSTRAINT "interview_panelists_interview_id_fkey" FOREIGN KEY ("interview_id") REFERENCES "interviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_panelists" ADD CONSTRAINT "interview_panelists_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scorecard_templates" ADD CONSTRAINT "scorecard_templates_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scorecard_criteria" ADD CONSTRAINT "scorecard_criteria_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "scorecard_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scorecards" ADD CONSTRAINT "scorecards_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scorecards" ADD CONSTRAINT "scorecards_interview_id_fkey" FOREIGN KEY ("interview_id") REFERENCES "interviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scorecards" ADD CONSTRAINT "scorecards_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scorecards" ADD CONSTRAINT "scorecards_interviewer_id_fkey" FOREIGN KEY ("interviewer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scorecards" ADD CONSTRAINT "scorecards_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "scorecard_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scorecard_ratings" ADD CONSTRAINT "scorecard_ratings_scorecard_id_fkey" FOREIGN KEY ("scorecard_id") REFERENCES "scorecards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scorecard_ratings" ADD CONSTRAINT "scorecard_ratings_criterion_id_fkey" FOREIGN KEY ("criterion_id") REFERENCES "scorecard_criteria"("id") ON DELETE CASCADE ON UPDATE CASCADE;
