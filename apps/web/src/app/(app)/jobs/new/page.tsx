'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { ApiError, api } from '@/lib/api';

interface PipelineTemplate {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  stages: {
    name: string;
    position: number;
    type: string;
    requiresScorecard: boolean;
    slaDays: number | null;
  }[];
}

interface CreatedJob {
  id: string;
}

const EMPLOYMENT_TYPES = [
  { value: 'FULL_TIME', label: 'Full time' },
  { value: 'PART_TIME', label: 'Part time' },
  { value: 'CONTRACT', label: 'Contract' },
  { value: 'INTERNSHIP', label: 'Internship' },
] as const;

export default function NewJobPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<PipelineTemplate[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [title, setTitle] = useState('');
  const [department, setDepartment] = useState('');
  const [location, setLocation] = useState('Remote');
  const [employmentType, setEmploymentType] = useState('FULL_TIME');
  const [openings, setOpenings] = useState(1);
  const [isRemote, setIsRemote] = useState(true);
  const [description, setDescription] = useState('');
  const [notice, setNotice] = useState<{ tone: string; text: string } | null>(null);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api<{ data: PipelineTemplate[] }>('/jobs/templates')
      .then((response) => {
        setTemplates(response.data);
        setTemplateId(response.data.find((template) => template.isDefault)?.id ?? response.data[0]?.id ?? '');
      })
      .catch((caught) => {
        const message = caught instanceof ApiError ? caught.message : 'Could not load pipeline templates.';
        setNotice({ tone: 'error', text: message });
      })
      .finally(() => setLoadingTemplates(false));
  }, []);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === templateId),
    [templates, templateId],
  );

  async function createJob(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!templateId) {
      setNotice({ tone: 'error', text: 'Choose a pipeline template before creating the requisition.' });
      return;
    }

    setSubmitting(true);
    setNotice(null);
    try {
      const job = await api<CreatedJob>('/jobs', {
        method: 'POST',
        body: JSON.stringify({
          title,
          description,
          department: department || undefined,
          location: location || undefined,
          employmentType,
          isRemote,
          openings,
          pipelineTemplateId: templateId,
          assigneeIds: [],
        }),
      });
      router.push(`/jobs/${job.id}`);
    } catch (caught) {
      const message = caught instanceof ApiError ? caught.message : 'Could not create the requisition.';
      setNotice({ tone: 'error', text: message });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div className="eyebrow">
          <Link href="/jobs">Requisitions</Link> / New
        </div>
        <h1>New requisition</h1>
        <p className="lede">
          Create a draft job from a pipeline template. Publishing still happens from the API status
          flow, so the time-to-hire clock starts only when the requisition is opened.
        </p>
      </div>

      {notice && (
        <div className="notice" data-tone={notice.tone}>
          {notice.text}
        </div>
      )}

      <form className="form-shell" onSubmit={createJob}>
        <section className="form-main card">
          <label className="field">
            <span>Title</span>
            <input
              required
              minLength={3}
              maxLength={120}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Senior Backend Engineer"
            />
          </label>

          <label className="field">
            <span>Description</span>
            <textarea
              required
              minLength={20}
              maxLength={20000}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What this person will work on, what good looks like, and why the role exists."
            />
          </label>

          <div className="split-fields">
            <label className="field">
              <span>Department</span>
              <input
                maxLength={80}
                value={department}
                onChange={(event) => setDepartment(event.target.value)}
                placeholder="Engineering"
              />
            </label>

            <label className="field">
              <span>Location</span>
              <input
                maxLength={120}
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                placeholder="Remote"
              />
            </label>
          </div>

          <div className="split-fields">
            <label className="field">
              <span>Employment type</span>
              <select value={employmentType} onChange={(event) => setEmploymentType(event.target.value)}>
                {EMPLOYMENT_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Openings</span>
              <input
                required
                min={1}
                max={100}
                type="number"
                value={openings}
                onChange={(event) => setOpenings(Number(event.target.value))}
              />
            </label>
          </div>

          <label className="check-row">
            <input
              type="checkbox"
              checked={isRemote}
              onChange={(event) => setIsRemote(event.target.checked)}
            />
            <span>Remote role</span>
          </label>
        </section>

        <aside className="form-side card">
          <label className="field">
            <span>Pipeline template</span>
            <select
              required
              disabled={loadingTemplates || templates.length === 0}
              value={templateId}
              onChange={(event) => setTemplateId(event.target.value)}
            >
              {loadingTemplates ? <option value="">Loading templates…</option> : null}
              {!loadingTemplates && templates.length === 0 ? <option value="">No templates found</option> : null}
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </label>

          {selectedTemplate ? (
            <div className="template-preview">
              <div className="metric-note">{selectedTemplate.description}</div>
              <ol>
                {selectedTemplate.stages.map((stage) => (
                  <li key={`${stage.position}-${stage.type}`}>
                    <span>{stage.name}</span>
                    <span className="metric-note">{stage.type.toLowerCase().replace('_', ' ')}</span>
                  </li>
                ))}
              </ol>
            </div>
          ) : (
            <p className="metric-note">Templates will appear here once they load.</p>
          )}

          <div className="actions-row">
            <Link href="/jobs" className="btn">
              Cancel
            </Link>
            <button className="btn" data-variant="primary" disabled={submitting || !templateId}>
              {submitting ? 'Creating…' : 'Create draft'}
            </button>
          </div>
        </aside>
      </form>
    </>
  );
}
