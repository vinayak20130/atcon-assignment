import Link from 'next/link';
import { API_BASE } from '@/lib/api';

interface Job {
  id: string;
  slug: string;
  title: string;
  department: string | null;
  location: string | null;
  employmentType: string;
  isRemote: boolean;
}

async function getJobs(): Promise<Job[]> {
  // Server-rendered and uncached: a posting that closed an hour ago should not
  // still be collecting applications.
  const response = await fetch(`${API_BASE}/api/v1/public/jobs?limit=50`, { cache: 'no-store' });
  if (!response.ok) return [];
  const body = (await response.json()) as { data: Job[] };
  return body.data;
}

export default async function CareersPage() {
  const jobs = await getJobs();

  return (
    <div className="public-shell">
      <header className="masthead">
        <div className="eyebrow">Northwind Labs</div>
        <h1>Open roles</h1>
        <p className="lede">
          Applying takes a couple of minutes and you will not be asked to create an account.
        </p>
      </header>

      {jobs.length === 0 ? (
        <div className="empty">
          <strong>No open roles right now</strong>
          Check back soon, or write to us at careers@northwind.test.
        </div>
      ) : (
        jobs.map((job) => (
          <Link key={job.id} href={`/careers/${job.slug}`} className="job-entry">
            <div className="job-title">{job.title}</div>
            <div className="job-facts">
              {job.department && <span>{job.department}</span>}
              <span>{job.isRemote ? `${job.location ?? 'Anywhere'} · remote` : job.location}</span>
              <span>{job.employmentType.toLowerCase().replace('_', ' ')}</span>
            </div>
          </Link>
        ))
      )}

      <p style={{ fontSize: '0.8125rem', color: 'var(--ink-faint)', marginTop: 36 }}>
        Recruiter?{' '}
        <Link href="/login" style={{ color: 'var(--accent)' }}>
          Sign in
        </Link>
        .
      </p>
    </div>
  );
}
