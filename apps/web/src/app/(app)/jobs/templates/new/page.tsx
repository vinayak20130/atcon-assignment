'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useEffect, useState } from 'react';
import { DEFAULT_STAGES, StageEditor, pipelineHasOutcomes, stagesToPayload, type StageDraft } from '@/components/StageEditor';
import { ApiError, api } from '@/lib/api';

interface PipelineTemplate {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  stages: {
    name: string;
    type: string;
    requiresScorecard: boolean;
    slaDays: number | null;
  }[];
}

function NewTemplateForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromId = searchParams.get('from');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [stages, setStages] = useState<StageDraft[]>(DEFAULT_STAGES);
  const [notice, setNotice] = useState<{ tone: string; text: string } | null>(null);
  const [loadingSource, setLoadingSource] = useState(Boolean(fromId));
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!fromId) return;
    api<{ data: PipelineTemplate[] }>('/jobs/templates')
      .then((response) => {
        const source = response.data.find((template) => template.id === fromId);
        if (!source) {
          setNotice({ tone: 'error', text: 'That template could not be found.' });
          return;
        }
        setName(`${source.name} (copy)`);
        setDescription(source.description ?? '');
        setIsDefault(false);
        setStages(
          source.stages.map((stage) => ({
            name: stage.name,
            type: stage.type,
            requiresScorecard: stage.requiresScorecard,
            slaDays: stage.slaDays == null ? '' : String(stage.slaDays),
          })),
        );
      })
      .catch((caught) => {
        const message = caught instanceof ApiError ? caught.message : 'Could not load that template.';
        setNotice({ tone: 'error', text: message });
      })
      .finally(() => setLoadingSource(false));
  }, [fromId]);

  async function createTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pipelineHasOutcomes(stages)) {
      setNotice({ tone: 'error', text: 'A template needs both Hired and Rejected stages.' });
      return;
    }

    setSubmitting(true);
    setNotice(null);
    try {
      await api('/jobs/templates', {
        method: 'POST',
        body: JSON.stringify({
          name,
          description: description || undefined,
          isDefault,
          stages: stagesToPayload(stages),
        }),
      });
      router.push('/jobs/templates');
    } catch (caught) {
      const message = caught instanceof ApiError ? caught.message : 'Could not create the template.';
      setNotice({ tone: 'error', text: message });
    } finally {
      setSubmitting(false);
    }
  }

  if (loadingSource) return <p className="lede">Loading template…</p>;

  return (
    <>
      <div className="page-head">
        <div className="eyebrow">
          <Link href="/jobs/templates">Templates</Link> / New
        </div>
        <h1>{fromId ? 'New template from copy' : 'New template'}</h1>
        <p className="lede">
          Name the pipeline and list its stages. This is a blueprint — openings created from it
          keep their own copy of these stages.
        </p>
      </div>

      {notice && (
        <div className="notice" data-tone={notice.tone}>
          {notice.text}
        </div>
      )}

      <form className="form-shell" onSubmit={createTemplate}>
        <section className="form-main card">
          <label className="field">
            <span>Name</span>
            <input
              required
              minLength={3}
              maxLength={80}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Engineering — Standard"
            />
          </label>

          <label className="field">
            <span>Description</span>
            <textarea
              maxLength={500}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="When this pipeline should be used."
            />
          </label>

          <label className="check-row">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(event) => setIsDefault(event.target.checked)}
            />
            <span>Default for new requisitions</span>
          </label>
        </section>

        <aside className="form-side card">
          <StageEditor stages={stages} onChange={setStages} />
          <div className="actions-row">
            <Link href="/jobs/templates" className="btn">
              Cancel
            </Link>
            <button className="btn" data-variant="primary" disabled={submitting}>
              {submitting ? 'Saving…' : 'Save template'}
            </button>
          </div>
        </aside>
      </form>
    </>
  );
}

export default function NewTemplatePage() {
  return (
    <Suspense fallback={<p className="lede">Loading form…</p>}>
      <NewTemplateForm />
    </Suspense>
  );
}
