'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ApiError, api, since } from '@/lib/api';

interface Stage {
  id: string;
  name: string;
  position: number;
  type: string;
  requiresScorecard: boolean;
}
interface JobDetail {
  id: string;
  title: string;
  status: string;
  stages: Stage[];
}
interface AppRow {
  id: string;
  status: string;
  lastActivityAt: string;
  candidate: { id: string; fullName: string; primaryEmail: string | null };
  currentStage: { id: string; name: string; position: number };
}

export default function BoardPage() {
  const { id } = useParams<{ id: string }>();
  const [job, setJob] = useState<JobDetail | null>(null);
  const [applications, setApplications] = useState<AppRow[]>([]);
  const [notice, setNotice] = useState<{ tone: string; text: string } | null>(null);
  const [moving, setMoving] = useState<string | null>(null);

  const load = useCallback(() => {
    void api<JobDetail>(`/jobs/${id}`).then(setJob).catch(() => setJob(null));
    void api<{ data: AppRow[] }>(`/applications?jobId=${id}&limit=100`)
      .then((r) => setApplications(r.data))
      .catch(() => setApplications([]));
  }, [id]);

  useEffect(load, [load]);

  // fromStageId is sent from what this board last rendered. That is what turns
  // a stale view into a clean 409 rather than one recruiter silently
  // overwriting another's decision.
  async function move(application: AppRow, toStage: Stage) {
    const needsReason = ['REJECTED'].includes(toStage.type);
    const reason = needsReason
      ? window.prompt(`Why is ${application.candidate.fullName} not moving forward?`)
      : undefined;
    if (needsReason && !reason) return;

    setMoving(application.id);
    setNotice(null);
    try {
      await api(`/applications/${application.id}/transitions`, {
        method: 'POST',
        body: JSON.stringify({
          fromStageId: application.currentStage.id,
          toStageId: toStage.id,
          reason,
        }),
      });
      setNotice({ tone: 'ok', text: `${application.candidate.fullName} → ${toStage.name}` });
      load();
    } catch (caught) {
      if (caught instanceof ApiError) {
        // A stale board is the one failure worth handling specially: reload so
        // the recruiter sees what actually happened rather than an error.
        if (caught.status === 409) load();
        setNotice({ tone: 'error', text: caught.message });
      }
    } finally {
      setMoving(null);
    }
  }

  if (!job) return <p className="lede">Loading board…</p>;

  const active = applications.filter((a) => a.status === 'ACTIVE');
  const movable = job.stages.filter((s) => s.type !== 'APPLIED');

  return (
    <>
      <div className="page-head">
        <div className="eyebrow">
          <Link href="/jobs">Requisitions</Link> / Board
        </div>
        <h1>{job.title}</h1>
        <p className="lede">
          These stages were copied onto this requisition when it was created, so editing the
          template they came from cannot reshape it underneath these candidates.
        </p>
      </div>

      {notice && (
        <div className="notice" data-tone={notice.tone}>
          {notice.text}
        </div>
      )}

      <div className="board">
        {job.stages.map((stage) => {
          const cards = active.filter((a) => a.currentStage.id === stage.id);
          return (
            <section key={stage.id} className="column">
              <header className="column-head">
                <span className="column-name">{stage.name}</span>
                <span className="column-count">{cards.length}</span>
              </header>

              {cards.length === 0 ? (
                <p style={{ fontSize: '0.75rem', color: 'var(--ink-faint)', padding: '4px' }}>
                  Nobody here
                </p>
              ) : (
                cards.map((application) => (
                  <article key={application.id} className="cand-card">
                    <Link href={`/applications/${application.id}`}>
                      <div className="cand-name">{application.candidate.fullName}</div>
                      <div className="cand-meta">{since(application.lastActivityAt)}</div>
                    </Link>
                    <select
                      className="btn btn-sm"
                      style={{ marginTop: 8, width: '100%' }}
                      disabled={moving === application.id}
                      value=""
                      onChange={(event) => {
                        const target = movable.find((s) => s.id === event.target.value);
                        if (target) void move(application, target);
                      }}
                    >
                      <option value="">Move to…</option>
                      {movable
                        .filter((s) => s.id !== stage.id)
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                    </select>
                  </article>
                ))
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
