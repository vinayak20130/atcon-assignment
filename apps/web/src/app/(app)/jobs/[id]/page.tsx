'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ApiError, api, since } from '@/lib/api';

const CAL_LINK = 'https://cal.com/vinayakits30/15min';

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
  currentStage: { id: string; name: string; position: number; type: string };
}

/** Open Cal.com pre-filled with the candidate's name as the booking note. */
function openCalLink(candidateName: string, jobTitle: string) {
  const url = new URL(CAL_LINK);
  url.searchParams.set('name', candidateName);
  url.searchParams.set('notes', `Interview for ${jobTitle}`);
  window.open(url.toString(), '_blank', 'noopener,noreferrer');
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

  // fromStageId is sent from what this board last rendered. That turns a stale
  // view into a clean 409 rather than one recruiter silently overwriting another.
  async function move(application: AppRow, toStage: Stage) {
    const isRegression = toStage.position < application.currentStage.position;
    const needsReason = toStage.type === 'REJECTED' || isRegression;
    const reason = needsReason
      ? window.prompt(
          toStage.type === 'REJECTED'
            ? `Why is ${application.candidate.fullName} not moving forward?`
            : `Why is ${application.candidate.fullName} moving back to ${toStage.name}?`,
        )
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
        if (caught.status === 409) load();
        setNotice({ tone: 'error', text: caught.message });
      }
    } finally {
      setMoving(null);
    }
  }

  if (!job) return <p className="lede">Loading board…</p>;

  const movable = job.stages.filter((s) => s.type !== 'APPLIED');

  return (
    <>
      <div className="page-head">
        <div className="eyebrow">
          <Link href="/jobs">Requisitions</Link> / Board
        </div>
        <h1>{job.title}</h1>
        <p className="lede">
          Move candidates through the pipeline. Interview stages show a Cal.com booking button —
          schedule the call, then grade and advance once done.
        </p>
      </div>

      {notice && (
        <div className="notice" data-tone={notice.tone}>
          {notice.text}
        </div>
      )}

      <div className="board">
        {job.stages.map((stage) => {
          const cards = applications.filter((a) => a.currentStage.id === stage.id);
          const isInterviewStage = stage.type === 'INTERVIEW' || stage.type === 'ASSESSMENT';

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

                    {/* Cal.com booking — shown only on interview stages */}
                    {isInterviewStage && (
                      <button
                        className="btn btn-sm"
                        style={{ marginTop: 6, width: '100%', background: 'var(--accent)', color: '#fff' }}
                        onClick={() => openCalLink(application.candidate.fullName, job.title)}
                      >
                        📅 Schedule interview
                      </button>
                    )}

                    {/* Move to next stage — after interview recruiter picks outcome */}
                    <select
                      className="btn btn-sm"
                      style={{ marginTop: 6, width: '100%' }}
                      disabled={moving === application.id}
                      value=""
                      onChange={(event) => {
                        const target = movable.find((s) => s.id === event.target.value);
                        if (target) void move(application, target);
                      }}
                    >
                      <option value="">{isInterviewStage ? 'Record outcome…' : 'Move to…'}</option>
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
