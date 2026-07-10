'use client';

import { useEffect, useRef, useState } from 'react';
import { track } from '@/lib/track';

const CHANNEL = 'e4coach-study-import';

export function StudyImportForm() {
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [started, setStarted] = useState(false);
  const channelRef = useRef<BroadcastChannel | null>(null);

  const closeChannel = () => {
    try {
      channelRef.current?.close();
    } catch {
      /* noop */
    }
    channelRef.current = null;
  };

  useEffect(() => closeChannel, []);

  /**
   * Listen for the auth tab's completion signal. We can't rely on
   * `window.opener` (Lichess's COOP severs it), so the auth tab announces the
   * destination over a same-origin BroadcastChannel. We ack (so it knows a real
   * app tab exists and can close itself) and then navigate this tab.
   */
  function listenForHandoff() {
    closeChannel();
    let channel: BroadcastChannel;
    try {
      channel = new BroadcastChannel(CHANNEL);
    } catch {
      return; // unsupported — the auth tab falls back to navigating itself
    }
    channelRef.current = channel;
    channel.onmessage = (ev: MessageEvent) => {
      const data = ev.data as { type?: string; to?: string };
      if (data?.type !== 'handoff' || typeof data.to !== 'string') return;
      const to = data.to.startsWith('/') && !data.to.startsWith('//') ? data.to : '/';
      channel.postMessage({ type: 'ack' });
      // Small delay so the ack reaches the auth tab before we navigate away.
      window.setTimeout(() => {
        window.location.href = to;
      }, 200);
    };
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    track('signup_submitted', { source: 'lichess-study' });

    // Open Lichess authorization in a NEW tab, synchronously within the click so
    // pop-up blockers allow it. Keeping this (app) tab open means Lichess's
    // "you can close this page" prompt only ever applies to the throwaway auth
    // tab — closing it can never destroy the user's app session.
    const authTab = window.open('about:blank', '_blank');

    try {
      const res = await fetch('/api/import/study/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, consent }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        authTab?.close();
        setError(json.error ?? 'Something went wrong. Please try again.');
        setSubmitting(false);
        return;
      }
      if (authTab && !authTab.closed) {
        listenForHandoff();
        authTab.location.href = json.data.url;
        setStarted(true);
      } else {
        // Pop-up was blocked — fall back to same-tab navigation.
        window.location.href = json.data.url;
      }
    } catch {
      authTab?.close();
      setError('Network error. Please try again.');
      setSubmitting(false);
    }
  }

  if (started) {
    return (
      <div className="w-full max-w-md space-y-3 text-sm text-neutral-600">
        <p className="font-medium text-neutral-900">Finish connecting in the new tab</p>
        <p>
          We opened Lichess in a new tab. Authorize read-only access to your studies there — once
          you&apos;re done, <strong>this</strong> tab continues to your analysis automatically.
        </p>
        <p className="text-neutral-500">
          Keep this tab open. If a new tab didn&apos;t appear, allow pop-ups and{' '}
          <button
            type="button"
            onClick={() => {
              closeChannel();
              setStarted(false);
              setSubmitting(false);
            }}
            className="text-brand underline"
          >
            try again
          </button>
          .
        </p>
      </div>
    );
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
