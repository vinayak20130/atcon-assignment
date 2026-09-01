'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, formatDate, since } from '@/lib/api';

interface Detail {
  id: string;
  status: string;
  source: string;
  appliedAt: string;
  lastActivityAt: string;
  coverLetter: string | null;
  candidate: {
    id: string;
    fullName: string;
    primaryEmail: string | null;
    primaryPhone: string | null;
    location: string | null;
    linkedinUrl: string | null;
    skills: string[];
  };
  job: { id: string; title: string };
  currentStage: { id: string; name: string };
  documents: Array<{ id: string; filename: string; parseStatus: string }>;
}

interface TrailEvent {
  id: string;
  seq: number;
  type: string;
  occurredAt: string;
  reason: string | null;
  actorType: string;
  actor: { fullName: string } | null;
  fromStage: { name: string } | null;
  toStage: { name: string } | null;
}

// Which events are decisions, which are outcomes, which need attention.
const EVENT_KIND: Record<string, string> = {
  HIRED: 'positive',
  REJECTED: 'warn',
  WITHDRAWN: 'warn',
  MARKED_STAGNANT: 'warn',
  RESUME_PARSE_FAILED: 'warn',
  STAGE_CHANGED: 'decision',
  REOPENED: 'decision',
};

const PARSE_TONE: Record<string, string> = {
  SUCCEEDED: 'positive',
  PARTIAL: 'warn',
  FAILED: 'warn',
};

export default function ApplicationPage() {
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [trail, setTrail] = useState<TrailEvent[]>([]);

  useEffect(() => {
    void api<Detail>(`/applications/${id}`).then(setDetail).catch(() => setDetail(null));
    void api<{ data: TrailEvent[] }>(`/applications/${id}/events`)
      .then((r) => setTrail(r.data))
      .catch(() => setTrail([]));
  }, [id]);

  if (!detail) return <p className="lede">Loading application…</p>;

  const { candidate } = detail;

  return (
    <>
      <div className="page-head">
        <div className="eyebrow">
          <Link href={`/jobs/${detail.job.id}`}>{detail.job.title}</Link> / Application
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h1>{candidate.fullName}</h1>
          <span
            className="pill"
            data-tone={
              detail.status === 'HIRED' ? 'positive' : detail.status === 'ACTIVE' ? 'accent' : 'closed'
            }
          >
            {detail.status.toLowerCase()}
          </span>
          <span className="pill">{detail.currentStage.name}</span>
        </div>
        <p className="lede">
          Applied {since(detail.appliedAt)} ·{' '}
          <span className="mono">{detail.source.toLowerCase().replace('_', ' ')}</span>
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr)', gap: 18 }}>
        {/* The signature: the append-only log, hung off a numbered rail. */}
        <section className="card">
          <div className="eyebrow">Audit trail · append-only</div>
          <p style={{ fontSize: '0.8125rem', color: 'var(--ink-muted)', margin: '0 0 18px' }}>
            Every decision about this person, in sequence, with who made it and why. Enforced by a
            database trigger, so nothing here can be rewritten.
          </p>

          {trail.length === 0 ? (
            <div className="empty">
              <strong>No history yet</strong>
              Events appear here as the application moves.
            </div>
          ) : (
            <ol className="trail">
              {trail.map((event) => (
                <li key={event.id} className="trail-item" data-kind={EVENT_KIND[event.type]}>
                  <span className="trail-seq">{event.seq}</span>
                  <span className="trail-dot" />
                  <div className="trail-head">
                    <span className="trail-type">
                      {event.toStage ? (
                        <>
                          {event.fromStage ? `${event.fromStage.name} → ` : ''}
                          {event.toStage.name}
                        </>
                      ) : (
                        event.type.toLowerCase().replace(/_/g, ' ')
                      )}
                    </span>
                    <span className="trail-actor">
                      {event.actor?.fullName ?? (
                        <span className="mono">{event.actorType.toLowerCase()}</span>
                      )}
                    </span>
                    <span className="trail-time">{formatDate(event.occurredAt)}</span>
                  </div>
                  {event.reason && <p className="trail-reason">{event.reason}</p>}
                </li>
              ))}
            </ol>
          )}
        </section>

        <aside style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
          <div className="card card-tight">
            <div className="eyebrow">Contact</div>
            <div style={{ fontSize: '0.875rem', marginTop: 8, display: 'grid', gap: 4 }}>
              <span>{candidate.primaryEmail ?? '—'}</span>
              <span className="mono" style={{ fontSize: '0.8125rem' }}>
                {candidate.primaryPhone ?? '—'}
              </span>
              <span style={{ color: 'var(--ink-muted)' }}>{candidate.location ?? '—'}</span>
            </div>
            {candidate.linkedinUrl && (
              <a
                className="btn btn-sm"
                style={{ marginTop: 10 }}
                href={candidate.linkedinUrl}
                target="_blank"
                rel="noreferrer"
              >
                LinkedIn
              </a>
            )}
          </div>

          {candidate.skills.length > 0 && (
            <div className="card card-tight">
              <div className="eyebrow">Skills · read from the resume</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 10 }}>
                {candidate.skills.map((skill) => (
                  <span key={skill} className="pill">
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}

          {detail.documents.length > 0 && (
            <div className="card card-tight">
              <div className="eyebrow">Documents</div>
              <ul style={{ listStyle: 'none', padding: 0, margin: '10px 0 0', display: 'grid', gap: 6 }}>
                {detail.documents.map((document) => (
                  <li
                    key={document.id}
                    style={{
                      fontSize: '0.8125rem',
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 8,
                    }}
                  >
                    <span>{document.filename}</span>
                    <span className="pill" data-tone={PARSE_TONE[document.parseStatus]}>
                      {document.parseStatus.toLowerCase()}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {detail.coverLetter && (
            <div className="card card-tight">
              <div className="eyebrow">Cover letter</div>
              <p className="prose" style={{ fontSize: '0.875rem', marginTop: 8 }}>
                {detail.coverLetter}
              </p>
            </div>
          )}
        </aside>
      </div>
    </>
  );
}
