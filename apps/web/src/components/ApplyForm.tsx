'use client';

import { useState } from 'react';
import { API_BASE } from '@/lib/api';

// Short on purpose. Every additional required field on a careers form costs
// real applicants, and almost everything else can be read off the resume or
// asked later. Phone is requested rather than required because it is the second
// deterministic dedupe key and materially improves identity resolution.
export function ApplyForm({ jobId }: { jobId: string }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/api/v1/public/jobs/${jobId}/applications`, {
        method: 'POST',
        body: new FormData(event.currentTarget),
      });
      const body = await response.json();

      if (!response.ok) {
        // The API's own message is written for the person reading it, so it is
        // shown rather than replaced with something generic.
        const detail = body?.message;
        setError(
          typeof detail === 'string'
            ? detail
            : (detail?.message ?? 'Your application could not be submitted.'),
        );
        return;
      }
      setDone(true);
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="notice" data-tone="ok" style={{ marginTop: 18 }}>
        <strong style={{ display: 'block', marginBottom: 4 }}>Application received</strong>
        Thanks — we will be in touch as it moves along.
      </div>
    );
  }

  return (
    <form onSubmit={submit} style={{ marginTop: 18 }}>
      {error && (
        <div className="notice" data-tone="error">
          {error}
        </div>
      )}

      <div className="field">
        <label htmlFor="fullName">Your name</label>
        <input id="fullName" name="fullName" type="text" required autoComplete="name" />
      </div>

      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" required autoComplete="email" />
      </div>

      <div className="field">
        <label htmlFor="phone">
          Phone <span className="hint">— optional</span>
        </label>
        <input id="phone" name="phone" type="tel" autoComplete="tel" placeholder="+91 98765 43210" />
      </div>

      <div className="field">
        <label htmlFor="location">
          Where you are based <span className="hint">— optional</span>
        </label>
        <input id="location" name="location" type="text" placeholder="Bengaluru, India" />
      </div>

      <div className="field">
        <label htmlFor="resume">
          Resume <span className="hint">— PDF, up to 5 MB</span>
        </label>
        <input id="resume" name="resume" type="file" accept="application/pdf" required />
      </div>

      <div className="field">
        <label htmlFor="coverLetter">
          Anything you want us to know <span className="hint">— optional</span>
        </label>
        <textarea
          id="coverLetter"
          name="coverLetter"
          placeholder="What drew you to this role, or anything your resume does not cover."
        />
      </div>

      {/* Left in the DOM for bots, hidden from people and screen readers. */}
      <div className="trap" aria-hidden="true">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <button className="btn" data-variant="primary" disabled={busy}>
        {busy ? 'Sending…' : 'Send application'}
      </button>
    </form>
  );
}
