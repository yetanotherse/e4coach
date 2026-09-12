'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { track } from '@/lib/track';

const POLL_INTERVAL_MS = 4000;
const POLL_TIMEOUT_MS = 4 * 60_000;

/**
 * Dashboard card for the failure path: the user has reports but no active
 * weekly plan (plan generation failed silently in the worker). One click
 * enqueues a lightweight plan-regeneration job (kind='plan') that rebuilds
 * the plan from the latest report, then polls until it's ready.
 */
export function PlanRegenerateCard() {
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'queued' | 'slow' | 'error'>('idle');

  async function regenerate() {
    setState('queued');
    track('plan_retry_clicked');
    try {
      const res = await fetch('/api/plan/regenerate', { method: 'POST' });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? 'request failed');
    } catch {
      setState('error');
      return;
    }
    const started = Date.now();
    const poll = setInterval(async () => {
      if (Date.now() - started > POLL_TIMEOUT_MS) {
        clearInterval(poll);
        setState('slow');
        return;
      }
      try {
        const res = await fetch('/api/plan/regenerate');
        const json = await res.json();
        if (json.ok && json.data.ready) {
          clearInterval(poll);
          router.refresh();
        }
      } catch {
        // Transient poll errors are fine; keep polling until timeout.
      }
    }, POLL_INTERVAL_MS);
  }

  return (
    <div className="mt-8 flex items-center justify-between rounded-lg border border-amber-300 bg-amber-50 px-4 py-4">
      <span>
        <span className="block font-semibold">No training plan for this week</span>
        <span className="text-sm text-neutral-600">
          {state === 'error'
            ? 'Something went wrong — try again.'
            : state === 'slow'
              ? 'Still generating — the plan will appear here shortly; refresh to check.'
              : 'Plan generation failed when your last report was created. Rebuild it from that report.'}
        </span>
      </span>
      <button
        onClick={regenerate}
        disabled={state === 'queued'}
        className="shrink-0 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
      >
        {state === 'queued' ? 'Generating…' : 'Create training plan'}
      </button>
    </div>
  );
}
