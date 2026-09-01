import { Injectable } from '@nestjs/common';
import { Prisma } from '@atcon/db';
import { PrismaService } from '../../prisma/services/prisma.service';

export interface FunnelStage {
  position: number;
  stageName: string;
  reached: number;
  /** Share of applicants who ever reached this stage. */
  reachRate: number;
  conversionToNext: number | null;
  medianDaysInStage: number | null;
}

export interface HealthAlert {
  severity: 'warning' | 'info';
  code: string;
  message: string;
}

// Pipeline metrics, derived from the event log.
//
// Everything here is a query over application_events. That is the payoff for
// making the log the source of truth rather than a side effect: conversion,
// dwell time and stagnation are all questions about the same table, and none of
// them needed a feature of their own.
//
// Two deliberate choices.
//
// TWO time metrics, not one. Time-to-fill runs from requisition opened to
// filled and answers "how long is this role costing us". Time-to-hire runs from
// application received and answers "how long do we leave people hanging". They
// are different questions and reporting one as the other is the usual mistake.
//
// NO composite health score. A single number would need weights invented here
// and defensible nowhere. A panel of real measurements plus explicit threshold
// alerts is more useful and can actually be argued with.
@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async pipelineHealth(orgId: string, jobId?: string) {
    const [timeToFill, timeToHire, counts, funnel] = await Promise.all([
      this.timeToFillDays(orgId, jobId),
      this.timeToHireDays(orgId, jobId),
      this.applicationCounts(orgId, jobId),
      this.funnel(orgId, jobId),
    ]);

    return {
      timeToFillDays: timeToFill,
      timeToHireDays: timeToHire,
      ...counts,
      funnel,
      alerts: this.deriveAlerts(funnel, counts),
    };
  }

  // A business metric: how long a vacancy stays a vacancy. Median rather than
  // mean, because one requisition that sat open for eight months would
  // otherwise define the number.
  private async timeToFillDays(orgId: string, jobId?: string): Promise<number | null> {
    const rows = await this.prisma.$queryRaw<Array<{ median: number | null }>>`
      SELECT percentile_cont(0.5) WITHIN GROUP (
               ORDER BY EXTRACT(EPOCH FROM (closed_at - opened_at)) / 86400
             )::float AS median
      FROM job_requisitions
      WHERE org_id = ${orgId}::uuid AND status = 'FILLED'
        AND opened_at IS NOT NULL AND closed_at IS NOT NULL
        ${jobId ? Prisma.sql`AND id = ${jobId}::uuid` : Prisma.empty}
    `;
    return round(rows[0]?.median ?? null);
  }

  /** A candidate-experience metric: how long a person waits on us. */
  private async timeToHireDays(orgId: string, jobId?: string): Promise<number | null> {
    const rows = await this.prisma.$queryRaw<Array<{ median: number | null }>>`
      SELECT percentile_cont(0.5) WITHIN GROUP (
               ORDER BY EXTRACT(EPOCH FROM (decided_at - applied_at)) / 86400
             )::float AS median
      FROM applications
      WHERE org_id = ${orgId}::uuid AND status = 'HIRED' AND decided_at IS NOT NULL
        ${jobId ? Prisma.sql`AND job_id = ${jobId}::uuid` : Prisma.empty}
    `;
    return round(rows[0]?.median ?? null);
  }

  private async applicationCounts(orgId: string, jobId?: string) {
    const rows = await this.prisma.$queryRaw<
      Array<{ active: bigint; hired: bigint; rejected: bigint; total: bigint }>
    >`
      SELECT count(*) FILTER (WHERE status = 'ACTIVE')   AS active,
             count(*) FILTER (WHERE status = 'HIRED')    AS hired,
             count(*) FILTER (WHERE status = 'REJECTED') AS rejected,
             count(*)                                    AS total
      FROM applications
      WHERE org_id = ${orgId}::uuid
        ${jobId ? Prisma.sql`AND job_id = ${jobId}::uuid` : Prisma.empty}
    `;
    const row = rows[0];
    return {
      activeApplications: Number(row?.active ?? 0),
      hiredApplications: Number(row?.hired ?? 0),
      rejectedApplications: Number(row?.rejected ?? 0),
      totalApplications: Number(row?.total ?? 0),
    };
  }

  /**
   * The conversion funnel, built from stages candidates actually reached.
   *
   * "Reached" means an event exists moving the application INTO that stage, not
   * that it is sitting there now. Someone already hired passed through
   * Technical Interview, and a funnel built from current position would miss
   * them and report conversion far worse than it is.
   *
   * Scoped to ONE requisition, conversion between adjacent stages is exact.
   * Org-wide it is deliberately omitted: different requisitions run different
   * pipelines, so "stage 2 converts at 40%" would be comparing unrelated
   * stages. Reach rate stays meaningful either way.
   */
  private async funnel(orgId: string, jobId?: string): Promise<FunnelStage[]> {
    const rows = await this.prisma.$queryRaw<
      Array<{ position: number; stage_name: string; reached: bigint; median_days: number | null }>
    >`
      WITH entries AS (
        SELECT DISTINCT ON (e.application_id, s.id)
               e.application_id, s.position, s.name AS stage_name,
               e.occurred_at AS entered_at,
               lead(e.occurred_at) OVER (
                 PARTITION BY e.application_id ORDER BY e.seq
               ) AS left_at
        FROM application_events e
        JOIN job_stages s   ON s.id = e.to_stage_id
        JOIN applications a ON a.id = e.application_id
        WHERE a.org_id = ${orgId}::uuid AND s.type <> 'REJECTED'
          ${jobId ? Prisma.sql`AND a.job_id = ${jobId}::uuid` : Prisma.empty}
        ORDER BY e.application_id, s.id, e.seq
      )
      SELECT position, stage_name,
             count(DISTINCT application_id) AS reached,
             percentile_cont(0.5) WITHIN GROUP (
               ORDER BY EXTRACT(EPOCH FROM (COALESCE(left_at, now()) - entered_at)) / 86400
             )::float AS median_days
      FROM entries
      GROUP BY position, stage_name
      ORDER BY position
    `;

    const entryCount = Number(rows[0]?.reached ?? 0);

    return rows.map((row, index) => {
      const reached = Number(row.reached);
      const next = rows[index + 1];

      return {
        position: row.position,
        stageName: row.stage_name,
        reached,
        reachRate: entryCount === 0 ? 0 : (round((reached / entryCount) * 100) ?? 0),
        // Only meaningful within a single pipeline — see the note above.
        conversionToNext:
          jobId && next && reached > 0
            ? // Clamped: a candidate reopened into a later stage can otherwise
              // produce a rate above 100%, which reads as a bug.
              (round(Math.min((Number(next.reached) / reached) * 100, 100)) ?? null)
            : null,
        medianDaysInStage: round(row.median_days),
      };
    });
  }

  // This is the part a composite score would throw away. "Technical Interview
  // converts at 8%" points somewhere specific; "pipeline health: 62" does not.
  private deriveAlerts(
    funnel: FunnelStage[],
    counts: { activeApplications: number },
  ): HealthAlert[] {
    const alerts: HealthAlert[] = [];

    for (const stage of funnel) {
      if (stage.conversionToNext !== null && stage.conversionToNext < 25 && stage.reached >= 5) {
        alerts.push({
          severity: 'warning',
          code: 'low-stage-conversion',
          message: `${stage.stageName} converts at ${stage.conversionToNext}% — worth checking whether the bar or the brief is wrong.`,
        });
      }
      if (stage.medianDaysInStage !== null && stage.medianDaysInStage > 14) {
        alerts.push({
          severity: 'warning',
          code: 'slow-stage',
          message: `Candidates sit in ${stage.stageName} for a median of ${stage.medianDaysInStage} days.`,
        });
      }
    }

    if (alerts.length === 0 && counts.activeApplications > 0) {
      alerts.push({
        severity: 'info',
        code: 'nothing-to-flag',
        message: 'No stage is converting unusually badly or holding candidates unusually long.',
      });
    }

    return alerts;
  }

  /** Where candidates come from, and which sources actually produce hires. */
  async sourceEffectiveness(orgId: string) {
    const rows = await this.prisma.$queryRaw<
      Array<{ source: string; applications: bigint; hired: bigint }>
    >`
      SELECT source, count(*) AS applications, count(*) FILTER (WHERE status = 'HIRED') AS hired
      FROM applications WHERE org_id = ${orgId}::uuid
      GROUP BY source ORDER BY count(*) DESC
    `;

    return rows.map((row) => {
      const applications = Number(row.applications);
      const hired = Number(row.hired);
      return {
        source: row.source,
        applications,
        hired,
        // Volume alone is misleading: a board sending 200 applications and no
        // hires is a cost, not a channel.
        hireRate: applications === 0 ? 0 : round((hired / applications) * 100),
      };
    });
  }
}

/** Two decimal places, and null stays null rather than becoming zero. */
function round(value: number | null): number | null {
  if (value === null || Number.isNaN(value)) return null;
  return Math.round(value * 100) / 100;
}
