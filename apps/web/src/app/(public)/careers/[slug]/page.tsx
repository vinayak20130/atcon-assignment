import Link from 'next/link';
import { notFound } from 'next/navigation';
import { API_BASE } from '@/lib/api';
import { ApplyForm } from '@/components/ApplyForm';

interface JobDetail {
  id: string;
  title: string;
  description: string;
  department: string | null;
  location: string | null;
  employmentType: string;
  isRemote: boolean;
  openings: number;
  stages: Array<{ name: string; position: number }>;
}

async function getJob(slug: string): Promise<JobDetail | null> {
  const response = await fetch(`${API_BASE}/api/v1/public/jobs/${slug}`, { cache: 'no-store' });
  if (!response.ok) return null;
  return (await response.json()) as JobDetail;
}

export default async function JobPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const job = await getJob(slug);
  if (!job) notFound();

  return (
    <div className="public-shell">
      <header className="masthead">
        <div className="eyebrow">
          <Link href="/careers">All roles</Link>
        </div>
        <h1>{job.title}</h1>
        <div className="job-facts" style={{ marginTop: 10 }}>
          {job.department && <span>{job.department}</span>}
          <span>{job.isRemote ? `${job.location ?? 'Anywhere'} · remote` : job.location}</span>
          <span>{job.employmentType.toLowerCase().replace('_', ' ')}</span>
        </div>
      </header>

      <div className="prose">{job.description}</div>

      {job.stages.length > 0 && (
        <section style={{ marginTop: 30 }}>
          <h2 style={{ fontSize: '1rem', marginBottom: 10 }}>How the process runs</h2>
          <ol
            style={{
              margin: 0,
              paddingLeft: 20,
              fontSize: '0.875rem',
              color: 'var(--ink-muted)',
              display: 'grid',
              gap: 3,
            }}
          >
            {job.stages.map((stage) => (
              <li key={stage.position}>{stage.name}</li>
            ))}
          </ol>
        </section>
      )}

      <section style={{ marginTop: 36, borderTop: '1px solid var(--rule-strong)', paddingTop: 26 }}>
        <h2>Apply</h2>
        <p style={{ color: 'var(--ink-muted)', fontSize: '0.875rem', marginTop: 4 }}>
          A resume and two details. No account needed.
        </p>
        <ApplyForm jobId={job.id} />
      </section>
    </div>
  );
}
