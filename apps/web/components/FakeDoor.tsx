'use client';

import { useState } from 'react';
import { track } from '@/lib/track';

/**
 * Fake-door WTP measurement (spec §3.1.8, §15). Records interest without a real
 * product behind it. Optional reportSlug attributes the click to a user.
 */
export function FakeDoor({ reportSlug }: { reportSlug?: string }) {
  const [clicked, setClicked] = useState(false);

  async function onClick(tier: 'notify' | 'monthly') {
    setClicked(true);
    track('interest_clicked', { tier });
    await fetch('/api/interest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tier, reportSlug }),
    }).catch(() => undefined);
  }

  if (clicked) {
    return (
      <p className="rounded-lg bg-brand/10 px-4 py-3 text-sm text-brand-dark">
        Thanks — we&apos;ll let you know the moment your weekly training plan is ready.
      </p>
    );
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5">
      <h3 className="text-lg font-semibold">Want a weekly training plan built from your games?</h3>
      <p className="mt-1 text-sm text-neutral-600">
        Targeted drills and a plan that adapts as you improve. Coming soon.
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          onClick={() => onClick('notify')}
          className="rounded-lg bg-brand px-4 py-2 font-medium text-white hover:bg-brand-dark"
        >
          Notify me
        </button>
        <button
          onClick={() => onClick('monthly')}
          className="rounded-lg border border-brand px-4 py-2 font-medium text-brand hover:bg-brand/5"
        >
          I&apos;d pay for this
        </button>
      </div>
    </div>
  );
}
