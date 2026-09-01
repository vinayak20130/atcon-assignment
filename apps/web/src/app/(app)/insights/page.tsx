'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface FunnelStage {
  stageName: string;
  reached: number;
  reachRate: number;
  conversionToNext: number | null;
  medianDaysInStage: number | null;
}
interface Health {
  timeToFillDays: number | null;
  timeToHireDays: number | null;
  activeApplications: number;
  hiredApplications: number;
  rejectedApplications: number;
  totalApplications: number;
  funnel: FunnelStage[];
  alerts: Array<{ severity: string; code: string; message: string }>;
}

function Metric({ value, unit, label, note }: { value: number | null; unit?: string; label: string; note: string }) {
  return (
    <div className="card">
      <div className="metric">
        {value ?? '—'}
        {value !== null && unit && (
          <span style={{ fontSize: '0.8rem', color: 'var(--ink-faint)', marginLeft: 3 }}>{unit}</span>
        )}
      </div>
      <div className="metric-label">{label}</div>
      <div className="metric-note">{note}</div>
    </div>
  );
}

export default function InsightsPage() {
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    void api<Health>('/analytics/pipeline-health').then(setHealth).catch(() => setHealth(null));
  }, []);

  if (!health) return <p className="lede">Loading insights…</p>;

  return (
    <>
      <div className="page-head">
        <div className="eyebrow">Pipeline health</div>
        <h1>Insights</h1>
        <p className="lede">
          Everything here is derived from the application event log. There is deliberately no single
          health score — a number nobody can defend is worse than five they can argue with.
        </p>
      </div>

      <div className="grid grid-3" style={{ marginBottom: 22 }}>
        <Metric
          value={health.timeToFillDays}
          unit="days"
          label="Time to fill"
          note="Requisition opened → filled. How long a role stays a vacancy."
        />
        <Metric
          value={health.timeToHireDays}
          unit="days"
          label="Time to hire"
          note="Application received → hired. How long a person waits on us."
        />
        <Metric
          value={health.activeApplications}
          label="In pipeline"
          note={`Of ${health.totalApplications} applications received.`}
        />
      </div>

      {health.alerts.length > 0 && (
        <div className="card" style={{ marginBottom: 22 }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>
            Worth a look
          </div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
            {health.alerts.map((alert) => (
              <li key={alert.code} style={{ display: 'flex', gap: 10, alignItems: 'start' }}>
                <span className="pill" data-tone={alert.severity === 'warning' ? 'warn' : undefined}>
                  {alert.severity}
                </span>
                <span style={{ fontSize: '0.875rem' }}>{alert.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card">
        <div className="eyebrow">Funnel · share of applicants reaching each stage</div>
        <p style={{ fontSize: '0.8125rem', color: 'var(--ink-muted)', margin: '6px 0 14px' }}>
          Counted from stages candidates actually entered, not where they are sitting now — someone
          already hired passed through the interview stage.
        </p>
        {health.funnel.length === 0 ? (
          <div className="empty">
            <strong>Nothing to chart yet</strong>
            The funnel fills in as candidates move through stages.
          </div>
        ) : (
          health.funnel.map((stage) => (
            <div key={stage.stageName} className="funnel-row">
              <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>{stage.stageName}</span>
              <div className="funnel-track">
                <div className="funnel-fill" style={{ width: `${Math.max(stage.reachRate, 4)}%` }}>
                  {stage.reached}
                </div>
              </div>
              <span className="funnel-figures">
                {stage.reachRate}%
                {stage.medianDaysInStage !== null && ` · ${stage.medianDaysInStage}d`}
              </span>
            </div>
          ))
        )}
      </div>
    </>
  );
}
