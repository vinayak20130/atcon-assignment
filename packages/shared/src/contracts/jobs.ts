import { z } from 'zod';
import { EmploymentType, JobStatus, StageType } from '../enums';

export const stageDefinitionSchema = z.object({
  name: z.string().trim().min(2).max(60),
  type: z.enum(StageType),
  requiresScorecard: z.boolean().default(false),
  /** Days in this stage before an application is flagged stagnant. */
  slaDays: z.number().int().positive().max(365).nullable().optional(),
});
export type StageDefinitionInput = z.infer<typeof stageDefinitionSchema>;

/**
 * A pipeline must be able to express both outcomes.
 *
 * Without a REJECTED stage there is nowhere to put the majority of applicants
 * and the funnel maths silently breaks. Enforced in the schema so a pipeline
 * cannot be created in that state at all.
 */
const stageListSchema = z
  .array(stageDefinitionSchema)
  .min(2, 'A pipeline needs at least an entry stage and an outcome.')
  .max(20)
  .refine(
    (stages) => stages.some((stage) => stage.type === StageType.HIRED),
    'A pipeline needs a HIRED stage.',
  )
  .refine(
    (stages) => stages.some((stage) => stage.type === StageType.REJECTED),
    'A pipeline needs a REJECTED stage — most applicants end there, and the funnel depends on it.',
  );

/**
 * The shape, kept separate from the cross-field rule below.
 *
 * Chaining `.refine()` wraps the object in ZodEffects, and the exported type is
 * taken from the base shape so inference stays clean while the rule still runs
 * at validation time.
 */
const jobCreateShape = z.object({
  title: z.string().trim().min(3).max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase words separated by hyphens.')
    .optional(),
  description: z.string().trim().min(20, 'Give candidates something to read.').max(20_000),
  department: z.string().trim().max(80).optional(),
  location: z.string().trim().max(120).optional(),
  employmentType: z.enum(EmploymentType).default(EmploymentType.FULL_TIME),
  isRemote: z.boolean().default(false),
  openings: z.number().int().min(1).max(100).default(1),

  /** Copy stages from this blueprint… */
  pipelineTemplateId: z.string().uuid().optional(),
  /** …or define them inline, for a requisition that fits no template. */
  stages: stageListSchema.optional(),

  assigneeIds: z.array(z.string().uuid()).max(10).default([]),
});

export const jobCreateSchema = jobCreateShape.refine(
  (job) => job.pipelineTemplateId != null || job.stages != null,
  {
    message: 'Provide either a pipeline template or an explicit stage list.',
    path: ['pipelineTemplateId'],
  },
);
export type JobCreateInput = z.infer<typeof jobCreateShape>;

/**
 * Status changes are their own endpoint rather than a field on update.
 *
 * Publishing is not an edit — it starts the time-to-fill clock and makes the
 * posting world-readable. A distinct route can be separately authorized and
 * separately audited.
 */
export const jobStatusChangeSchema = z.object({
  status: z.enum(JobStatus),
  reason: z.string().trim().max(500).optional(),
});
export type JobStatusChangeInput = z.infer<typeof jobStatusChangeSchema>;

export const pipelineTemplateCreateSchema = z.object({
  name: z.string().trim().min(3).max(80),
  description: z.string().trim().max(500).optional(),
  isDefault: z.boolean().default(false),
  stages: stageListSchema,
});
export type PipelineTemplateCreateInput = z.infer<typeof pipelineTemplateCreateSchema>;

export const pipelineTemplateCopySchema = z.preprocess(
  (value) => value ?? {},
  z.object({
    name: z.string().trim().min(3).max(80).optional(),
    isDefault: z.boolean().default(false),
  }),
);
export type PipelineTemplateCopyInput = {
  name?: string;
  isDefault: boolean;
};
