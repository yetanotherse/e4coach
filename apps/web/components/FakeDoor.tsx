'use client';

import { useState } from 'react';
import { track } from '@/lib/track';

type Tier = 'notify' | 'monthly';
type Phase = 'idle' | 'email' | 'done';

/**
 * Fake-door WTP measurement + waitlist (spec §3.1.8, §15). On the report page a
 * click is attributable to the signed-up user (contactable via their email); on
 * the homepage we capture an email so the lead is reachable.
 */
export function FakeDoor({ reportSlug }: { reportSlug?: string }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [tier, setTier] = useState<Tier>('notify');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function record(chosen: Tier, withEmail?: string): Promise<void> {
    track('interest_clicked', { tier: chosen });
    await fetch('/api/interest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tier: chosen, reportSlug, ...(withEmail ? { email: withEmail } : {}) }),
    }).catch(() => undefined);
  }

  async function onTier(chosen: Tier): Promise<void> {
    setTier(chosen);
    // Report page: the user is known — record immediately, no prompt.
    if (reportSlug) {
      setPhase('done');
      await record(chosen);
      return;
    }
    // Homepage: collect an email so we can actually reach them.
    setPhase('email');
  }

  async function onSubmitEmail(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setError('Please enter a valid email address.');
      return;
    }
    setSubmitting(true);
    await record(tier, email);
    setSubmitting(false);
    setPhase('done');
  }

  if (phase === 'done') {
    return (
      <p className="rounded-lg bg-brand/10 px-4 py-3 text-sm text-brand-dark">
        Thanks — you&apos;re on the list. We&apos;ll email you the moment your weekly training plan is
        ready.
      </p>
    );
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5">
      <h3 className="text-lg font-semibold">Want a weekly training plan built from your games?</h3>
      <p className="mt-1 text-sm text-neutral-600">
        Targeted drills and a plan that adapts as you improve. Coming soon.
      </p>

      {phase === 'idle' ? (
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            onClick={() => onTier('notify')}
            className="rounded-lg bg-brand px-4 py-2 font-medium text-white hover:bg-brand-dark"
          >
            Notify me
          </button>
          <button
            onClick={() => onTier('monthly')}
            className="rounded-lg border border-brand px-4 py-2 font-medium text-brand hover:bg-brand/5"
          >
            I&apos;d pay for this
          </button>
        </div>
      ) : (
        <form onSubmit={onSubmitEmail} className="mt-4 space-y-2">
          <label htmlFor="waitlist-email" className="block text-sm text-neutral-600">
            Where should we email you when it&apos;s ready?
          </label>
          <div className="flex flex-wrap gap-2">
            <input
              id="waitlist-email"
              type="email"
              value={email}
              onChange={(ev) => setEmail(ev.target.value)}
              placeholder="you@example.com"
              required
              autoFocus
              className="min-w-[220px] flex-1 rounded-lg border border-neutral-300 px-3 py-2 focus:border-brand focus:outline-none"
            />
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-brand px-4 py-2 font-medium text-white hover:bg-brand-dark disabled:opacity-60"
            >
              {submitting ? 'Adding…' : 'Join the waitlist'}
            </button>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </form>
      )}
    </div>
  );
}
