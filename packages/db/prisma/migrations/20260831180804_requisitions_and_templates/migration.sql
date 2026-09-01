-- AlterTable
ALTER TABLE "job_requisitions" ADD COLUMN     "pipeline_template_id" UUID;

-- CreateTable
CREATE TABLE "pipeline_templates" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pipeline_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pipeline_template_stages" (
    "id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "type" "stage_types" NOT NULL,
    "requires_scorecard" BOOLEAN NOT NULL DEFAULT false,
    "sla_days" INTEGER,

    CONSTRAINT "pipeline_template_stages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pipeline_templates_org_id_name_key" ON "pipeline_templates"("org_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "pipeline_template_stages_template_id_position_key" ON "pipeline_template_stages"("template_id", "position");

-- AddForeignKey
ALTER TABLE "job_requisitions" ADD CONSTRAINT "job_requisitions_pipeline_template_id_fkey" FOREIGN KEY ("pipeline_template_id") REFERENCES "pipeline_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline_templates" ADD CONSTRAINT "pipeline_templates_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline_template_stages" ADD CONSTRAINT "pipeline_template_stages_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "pipeline_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
