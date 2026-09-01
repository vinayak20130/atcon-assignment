'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, formatDate } from '@/lib/api';

interface JobRow {
  id: string;
  title: string;
  slug: string;
  status: string;
  department: string | null;
  location: string | null;
  openings: number;
  openedAt: string | null;
}

const TONE: Record<string, string> = {
  OPEN: 'accent',
  DRAFT: 'closed',
  PAUSED: 'warn',
  CLOSED: 'closed',
  FILLED: 'positive',
};

export default function JobsPage() {
  const [jobs, setJobs] = useState<JobRow[] | null>(null);

  useEffect(() => {
    api<{ data: JobRow[] }>('/jobs')
      .then((r) => setJobs(r.data))
      .catch(() => setJobs([]));
  }, []);

  if (!jobs) return <p className="lede">Loading requisitions…</p>;

  return (
    <>
      <div className="page-head">
        <div className="eyebrow">Requisitions</div>
        <div className="head-row">
          <h1>Your pipelines</h1>
          <div className="actions-row" style={{ marginTop: 0 }}>
            <Link href="/jobs/templates" className="btn">
              Templates
            </Link>
            <Link href="/jobs/new" className="btn" data-variant="primary">
              New opening
            </Link>
          </div>
        </div>
        <p className="lede">
          Only the requisitions you are assigned to. Access is scoped per requisition rather than
          granted org-wide.
        </p>
      </div>

      {jobs.length === 0 ? (
        <div className="empty">
          <strong>No requisitions assigned</strong>
          Post an opening to start a pipeline, or ask a colleague to assign you to one.
          <div style={{ marginTop: 14 }}>
            <Link href="/jobs/new" className="btn" data-variant="primary">
              New opening
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-2">
          {jobs.map((job) => (
            <Link key={job.id} href={`/jobs/${job.id}`} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <h3>{job.title}</h3>
                <span className="pill" data-tone={TONE[job.status]}>
                  {job.status.toLowerCase()}
                </span>
              </div>
              <div className="cand-meta" style={{ marginTop: 6 }}>
                {job.department ?? 'No department'} · {job.location ?? 'Location TBC'}
              </div>
              <div
                style={{
                  display: 'flex',
                  gap: 20,
                  marginTop: 14,
                  paddingTop: 12,
                  borderTop: '1px solid var(--rule)',
                }}
              >
                <div>
                  <div className="mono" style={{ fontSize: '1.05rem' }}>
                    {job.openings}
                  </div>
                  <div className="metric-note">opening{job.openings === 1 ? '' : 's'}</div>
                </div>
                <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                  <div style={{ fontSize: '0.8125rem' }}>{formatDate(job.openedAt)}</div>
                  <div className="metric-note">{job.openedAt ? 'opened' : 'not published'}</div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
