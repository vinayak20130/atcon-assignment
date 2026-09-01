'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ApiError, api } from '@/lib/api';

interface TemplateStage {
  name: string;
  position: number;
  type: string;
  requiresScorecard: boolean;
  slaDays: number | null;
}

interface PipelineTemplate {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  stages: TemplateStage[];
}

export default function TemplatesPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<PipelineTemplate[] | null>(null);
  const [notice, setNotice] = useState<{ tone: string; text: string } | null>(null);
  const [copyingId, setCopyingId] = useState<string | null>(null);

  async function load() {
    try {
      const response = await api<{ data: PipelineTemplate[] }>('/jobs/templates');
      setTemplates(response.data);
    } catch {
      setTemplates([]);
      setNotice({ tone: 'error', text: 'Could not load pipeline templates.' });
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function copyTemplate(template: PipelineTemplate) {
    setCopyingId(template.id);
    setNotice(null);
    try {
      const copy = await api<PipelineTemplate>(`/jobs/templates/${template.id}/copy`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setNotice({ tone: 'ok', text: `Copied as “${copy.name}”.` });
      await load();
    } catch (caught) {
      const message = caught instanceof ApiError ? caught.message : 'Could not copy that template.';
      setNotice({ tone: 'error', text: message });
    } finally {
      setCopyingId(null);
    }
  }

  if (!templates) return <p className="lede">Loading templates…</p>;

  return (
    <>
      <div className="page-head">
        <div className="eyebrow">Pipelines</div>
        <div className="head-row">
          <h1>Templates</h1>
          <Link href="/jobs/templates/new" className="btn" data-variant="primary">
            New template
          </Link>
        </div>
        <p className="lede">
          Blueprints for new requisitions. Copy one to fork a pipeline; creating an opening copies
          the stages onto that requisition, so later edits here never move candidates already in
          flight.
        </p>
      </div>

      {notice && (
        <div className="notice" data-tone={notice.tone}>
          {notice.text}
        </div>
      )}

      {templates.length === 0 ? (
        <div className="empty">
          <strong>No pipeline templates</strong>
          Create one, then use it when you post an opening.
          <div style={{ marginTop: 14 }}>
            <Link href="/jobs/templates/new" className="btn" data-variant="primary">
              New template
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-2">
          {templates.map((template) => (
            <article key={template.id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <h3>{template.name}</h3>
                {template.isDefault ? (
                  <span className="pill" data-tone="accent">
                    default
                  </span>
                ) : null}
              </div>
              <div className="cand-meta" style={{ marginTop: 6 }}>
                {template.description ?? 'No description'}
              </div>
              <ol className="stage-rail">
                {template.stages.map((stage, index) => (
                  <li key={`${template.id}-${stage.position}`}>
                    <span className="mono">{String(index + 1).padStart(2, '0')}</span>
                    {stage.name}
                  </li>
                ))}
              </ol>
              <div className="actions-row" style={{ marginTop: 14 }}>
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={copyingId === template.id}
                  onClick={() => void copyTemplate(template)}
                >
                  {copyingId === template.id ? 'Copying…' : 'Copy'}
                </button>
                <Link href={`/jobs/templates/new?from=${template.id}`} className="btn btn-sm">
                  Edit as new
                </Link>
                <button
                  type="button"
                  className="btn btn-sm"
                  data-variant="primary"
                  onClick={() => router.push(`/jobs/new?template=${template.id}`)}
                >
                  Use for opening
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
