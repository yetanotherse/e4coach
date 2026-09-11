'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface CheckInResult {
  alreadyCheckedIn: boolean;
  currentStreak: number;
  longestStreak: number;
}

/**
 * The weekly check-in button (plans/phase-2.md 2.4). POSTs /api/checkin
 * (idempotent per week) and refreshes the server-rendered stats.
 */
export function CheckInButton({ disabled }: { disabled?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CheckInResult | null>(null);
  const [error, setError] = useState(false);

  if (disabled && !result) {
    return <p className="text-sm text-neutral-500">✓ Checked in this week — see you next week.</p>;
  }

  async function checkIn() {
    setBusy(true);
    setError(false);
    try {
      const res = await fetch('/api/checkin', { method: 'POST' });
      if (!res.ok) throw new Error('failed');
      const body = (await res.json()) as { ok: boolean; data: CheckInResult };
      setResult(body.data);
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        onClick={checkIn}
        disabled={busy}
        className="rounded-lg bg-brand px-4 py-2 font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
      >
        {busy ? 'Checking in…' : 'Check in for this week'}
      </button>
      {result && (
        <p className="mt-2 text-sm text-neutral-600">
          {result.alreadyCheckedIn ? 'Already checked in —' : 'Checked in —'} streak:{' '}
          <span className="font-semibold">{result.currentStreak}</span> week
          {result.currentStreak === 1 ? '' : 's'}
          {result.currentStreak === result.longestStreak && result.currentStreak > 1 ? ' (new best!)' : ''}
        </p>
      )}
      {error && <p className="mt-2 text-sm text-red-700">Something went wrong — try again.</p>}
    </div>
  );
}
