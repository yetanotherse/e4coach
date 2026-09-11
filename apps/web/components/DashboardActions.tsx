'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { track } from '@/lib/track';

export interface DashboardActionsProps {
  lichessUser: string | null;
  chessComUser: string | null;
}

/**
 * "Analyze new games" + sign-out. The platform select lists only the
 * usernames the user has on file (plans/phase-2.md 2.1).
 */
export function DashboardActions({ lichessUser, chessComUser }: DashboardActionsProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [source, setSource] = useState<'lichess' | 'chesscom'>(lichessUser ? 'lichess' : 'chesscom');

  async function analyze() {
    setBusy(true);
    track('reanalyze_clicked', { source });
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source }),
      });
      const json = await res.json();
      if (json.ok) router.push(`/analyzing/${json.data.jobId}`);
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.refresh();
  }

  const options = [
    ...(lichessUser ? [{ id: 'lichess', label: 'Lichess' }] : []),
    ...(chessComUser ? [{ id: 'chesscom', label: 'Chess.com' }] : []),
  ];

  return (
    <div className="flex flex-wrap items-center gap-3">
      {options.length > 1 && (
        <select
          value={source}
          onChange={(e) => setSource(e.target.value as 'lichess' | 'chesscom')}
          className="rounded-lg border border-neutral-300 px-2 py-2 text-sm focus:border-brand focus:outline-none"
        >
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      )}
      <button
        onClick={analyze}
        disabled={busy}
        className="rounded-lg bg-brand px-4 py-2 font-medium text-white hover:bg-brand-dark disabled:opacity-60"
      >
        {busy ? 'Starting…' : 'Analyze new games'}
      </button>
      <button
        onClick={logout}
        className="rounded-lg border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-100"
      >
        Sign out
      </button>
    </div>
  );
}
