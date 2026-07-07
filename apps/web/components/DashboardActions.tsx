'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { track } from '@/lib/track';

export function DashboardActions() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function analyze() {
    setBusy(true);
    track('reanalyze_clicked');
    try {
      const res = await fetch('/api/analyze', { method: 'POST' });
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

  return (
    <div className="flex flex-wrap items-center gap-3">
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
