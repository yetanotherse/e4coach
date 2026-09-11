'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { track } from '@/lib/track';

const PERF_OPTIONS = ['bullet', 'blitz', 'rapid', 'classical'] as const;
const GAME_COUNT_OPTIONS = [20, 30, 40, 60];
const PLATFORMS = [
  { id: 'lichess', label: 'Lichess', placeholder: 'e.g. DrNykterstein' },
  { id: 'chesscom', label: 'Chess.com', placeholder: 'e.g. hikaru' },
] as const;

export function SignupForm() {
  const router = useRouter();
  const [platform, setPlatform] = useState<'lichess' | 'chesscom'>('lichess');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [consent, setConsent] = useState(false);
  const [maxGames, setMaxGames] = useState(30);
  const [perfTypes, setPerfTypes] = useState<string[]>(['blitz', 'rapid', 'classical']);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function togglePerf(perf: string) {
    setPerfTypes((cur) =>
      cur.includes(perf) ? cur.filter((p) => p !== perf) : [...cur, perf],
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (perfTypes.length === 0) {
      setError('Pick at least one time control.');
      return;
    }
    setSubmitting(true);
    track('signup_submitted');
    try {
      const body = {
        email,
        ...(platform === 'lichess' ? { lichessUser: username } : { chessComUser: username }),
        source: platform,
        consent,
        maxGames,
        perfTypes,
      };
      const res = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error ?? 'Something went wrong. Please try again.');
        return;
      }
      router.push(`/analyzing/${json.data.jobId}`);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const active = PLATFORMS.find((p) => p.id === platform)!;

  return (
    <form onSubmit={onSubmit} className="w-full max-w-md space-y-4">
      <div className="flex gap-1 rounded-lg bg-neutral-100 p-1">
        {PLATFORMS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => {
              setPlatform(p.id);
              setUsername('');
            }}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition ${
              platform === p.id
                ? 'bg-white text-neutral-900 shadow-sm'
                : 'text-neutral-500 hover:text-neutral-800'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div>
        <label htmlFor="username" className="block text-sm font-medium text-neutral-700">
          Your {active.label} username
        </label>
        <input
          id="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder={active.placeholder}
          required
          className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
        />
      </div>
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-neutral-700">
          Email (we&apos;ll send your report here)
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
          className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="maxGames" className="block text-sm font-medium text-neutral-700">
            Games to analyze
          </label>
          <select
            id="maxGames"
            value={maxGames}
            onChange={(e) => setMaxGames(Number(e.target.value))}
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 focus:border-brand focus:outline-none"
          >
            {GAME_COUNT_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n} most recent
              </option>
            ))}
          </select>
        </div>
        <div>
          <span className="block text-sm font-medium text-neutral-700">Time controls</span>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
            {PERF_OPTIONS.map((perf) => (
              <label key={perf} className="flex items-center gap-1 text-sm text-neutral-600">
                <input
                  type="checkbox"
                  checked={perfTypes.includes(perf)}
                  onChange={() => togglePerf(perf)}
                />
                {perf}
              </label>
            ))}
          </div>
        </div>
      </div>
      <label className="flex items-start gap-2 text-sm text-neutral-600">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-1"
        />
        <span>
          I agree to the analysis of my <strong>public</strong> games and to the{' '}
          <a href="/privacy" className="text-brand underline">
            privacy policy
          </a>
          .
        </span>
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-lg bg-brand px-4 py-2.5 font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60"
      >
        {submitting ? 'Starting…' : 'Get my free weakness report'}
      </button>
    </form>
  );
}
