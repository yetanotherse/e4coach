'use client';

import { useState } from 'react';

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    await fetch('/api/auth/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    }).catch(() => undefined);
    setSent(true);
    setSubmitting(false);
  }

  if (sent) {
    return (
      <p className="rounded-lg bg-brand/10 px-4 py-3 text-sm text-brand-dark">
        If that email has a report, we&apos;ve sent a sign-in link. Check your inbox.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        required
        className="w-full rounded-lg border border-neutral-300 px-3 py-2 focus:border-brand focus:outline-none"
      />
      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-lg bg-brand px-4 py-2 font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
      >
        {submitting ? 'Sending…' : 'Email me a sign-in link'}
      </button>
    </form>
  );
}
