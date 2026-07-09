'use client';

import { useState } from 'react';
import { track } from '@/lib/track';

const PERF_OPTIONS = ['ultrabullet', 'bullet', 'blitz', 'rapid', 'classical'] as const;

export function StudyImportForm() {
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [perfTypes, setPerfTypes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function togglePerf(perf: string) {
    setPerfTypes((cur) => (cur.includes(perf) ? cur.filter((p) => p !== perf) : [...cur, perf]));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    track('signup_submitted', { source: 'lichess-study' });
    try {
      const res = await fetch('/api/import/study/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          consent,
          ...(perfTypes.length ? { perfTypes } : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error ?? 'Something went wrong. Please try again.');
        return;
      }
      // Hand off to Lichess for authorization.
      window.location.href = json.data.url;
    } catch {
      setError('Network error. Please try again.');
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="w-full max-w-md space-y-4">
      <p className="text-sm text-neutral-600">
        Import the games you&apos;ve saved in your Lichess <strong>studies</strong>. We&apos;ll ask
        Lichess for read-only access to your studies, analyze the games, and show each one with a
        full move-by-move replay.
      </p>
      <div>
        <label htmlFor="study-email" className="block text-sm font-medium text-neutral-700">
          Email (we&apos;ll send your report here)
        </label>
        <input
          id="study-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
          className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 focus:border-brand focus:outline-none"
        />
      </div>
      <div>
        <span className="block text-sm font-medium text-neutral-700">
          Time controls <span className="font-normal text-neutral-400">(optional — all if none)</span>
        </span>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
          {PERF_OPTIONS.map((perf) => (
            <label key={perf} className="flex items-center gap-1 text-sm text-neutral-600">
              <input type="checkbox" checked={perfTypes.includes(perf)} onChange={() => togglePerf(perf)} />
              {perf}
            </label>
          ))}
        </div>
      </div>
      <label className="flex items-start gap-2 text-sm text-neutral-600">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1" />
        <span>
          I agree to the analysis of my Lichess study games and to the{' '}
          <a href="/privacy" className="text-brand underline">
            privacy policy
          </a>
          .
        </span>
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={submitting || !consent}
        className="w-full rounded-lg bg-brand px-4 py-2.5 font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60"
      >
        {submitting ? 'Connecting…' : 'Connect Lichess & import studies'}
      </button>
    </form>
  );
}
