'use client';

import { useState } from 'react';

type Mode = 'link' | 'code';

export function LoginForm() {
  const [mode, setMode] = useState<Mode>('link');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function post(url: string, body: Record<string, string>) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({ ok: false }))) as {
      ok: boolean;
      error?: string;
    };
    return { ok: res.ok && json.ok, error: json.error ?? (json.ok ? null : 'Something went wrong') };
  }

  async function requestLink(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const { ok, error: err } = await post('/api/auth/request', { email }).catch(() => ({
      ok: false,
      error: 'Network error — please try again.',
    }));
    if (!ok && err) setError(err);
    else setSent(true);
    setSubmitting(false);
  }

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const { ok, error: err } = await post('/api/auth/otp/request', { email }).catch(() => ({
      ok: false,
      error: 'Network error — please try again.',
    }));
    if (!ok && err) setError(err);
    else setSent(true);
    setSubmitting(false);
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const { ok, error: err } = await post('/api/auth/otp/verify', { email, code }).catch(() => ({
      ok: false,
      error: 'Network error — please try again.',
    }));
    if (!ok) {
      setError(err ?? 'Invalid or expired code.');
      setSubmitting(false);
      return;
    }
    window.location.href = '/dashboard';
  }

  const tab = (m: Mode, label: string) => (
    <button
      type="button"
      onClick={() => {
        setMode(m);
        setSent(false);
        setError(null);
      }}
      className={`flex-1 rounded-md px-3 py-1 text-sm font-medium ${
        mode === m ? 'bg-brand text-white' : 'text-neutral-600 hover:text-neutral-900'
      }`}
    >
      {label}
    </button>
  );

  const errorBox = error && (
    <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
  );

  if (sent) {
    return (
      <div className="space-y-3">
        <p className="rounded-lg bg-brand/10 px-4 py-3 text-sm text-brand-dark">
          {mode === 'link'
            ? "If that email has a report, we've sent a sign-in link. Check your inbox."
            : `If that email has a report, we've sent a 6-digit code. Check your inbox.`}
        </p>
        {mode === 'code' && (
          <form onSubmit={verifyCode} className="space-y-3">
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="6-digit code"
              required
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-center text-lg tracking-[0.4em] focus:border-brand focus:outline-none"
            />
            {errorBox}
            <button
              type="submit"
              disabled={submitting || code.length !== 6}
              className="w-full rounded-lg bg-brand px-4 py-2 font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
            >
              {submitting ? 'Checking…' : 'Sign in'}
            </button>
          </form>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-1 rounded-lg bg-neutral-100 p-1">
        {tab('link', 'Email link')}
        {tab('code', 'Use a code')}
      </div>
      {mode === 'link' ? (
        <form onSubmit={requestLink} className="space-y-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 focus:border-brand focus:outline-none"
          />
          {errorBox}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-brand px-4 py-2 font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
          >
            {submitting ? 'Sending…' : 'Email me a sign-in link'}
          </button>
        </form>
      ) : (
        <form onSubmit={requestCode} className="space-y-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 focus:border-brand focus:outline-none"
          />
          {errorBox}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-brand px-4 py-2 font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
          >
            {submitting ? 'Sending…' : 'Email me a 6-digit code'}
          </button>
        </form>
      )}
    </div>
  );
}
