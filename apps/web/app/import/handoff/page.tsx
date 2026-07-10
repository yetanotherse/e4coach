'use client';

import { useEffect, useState } from 'react';

const CHANNEL = 'e4coach-study-import';
// Longer than the app tab's ack delay so a real controlling tab always wins the
// race before we assume there's nobody listening.
const ACK_WAIT_MS = 1500;

/**
 * Tiny bridge shown at the end of the Lichess study import. The OAuth callback
 * (running in the throwaway auth tab) redirects here with `?to=<relative path>`.
 *
 * We cannot use `window.opener`: Lichess sets Cross-Origin-Opener-Policy during
 * authorization, which severs the opener link, so by the time we get here
 * `window.opener` is null. Instead we announce the result on a same-origin
 * BroadcastChannel:
 *   - If the app tab is listening, it acks and navigates itself to `to`; this
 *     (disposable) tab then closes.
 *   - If nobody acks within ACK_WAIT_MS (pop-up was blocked, so the flow ran in
 *     this same tab), we navigate here instead.
 */
export default function HandoffPage() {
  const [manualClose, setManualClose] = useState(false);

  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get('to') ?? '/';
    // Only same-origin relative paths (guard against an open-redirect via `to`).
    const to = raw.startsWith('/') && !raw.startsWith('//') ? raw : '/';

    let settled = false;
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(CHANNEL);
    } catch {
      channel = null;
    }

    const selfNavigate = () => {
      if (settled) return;
      settled = true;
      window.location.href = to;
    };

    if (!channel) {
      // No BroadcastChannel support — behave like the same-tab flow.
      selfNavigate();
      return;
    }

    channel.onmessage = (ev: MessageEvent) => {
      if (settled) return;
      if ((ev.data as { type?: string })?.type === 'ack') {
        settled = true;
        try {
          channel?.close();
        } catch {
          /* noop */
        }
        window.close(); // some browsers refuse; show a manual-close hint below
        setManualClose(true);
      }
    };

    channel.postMessage({ type: 'handoff', to });
    const timer = window.setTimeout(selfNavigate, ACK_WAIT_MS);

    return () => {
      window.clearTimeout(timer);
      try {
        channel?.close();
      } catch {
        /* noop */
      }
    };
  }, []);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
      <div className="mb-6 h-10 w-10 animate-spin rounded-full border-4 border-neutral-200 border-t-brand" />
      <h1 className="text-xl font-semibold">All set — returning to e4coach…</h1>
      <p className="mt-2 text-sm text-neutral-500">
        {manualClose
          ? 'You can close this tab now. Your analysis is starting in the e4coach tab.'
          : 'One moment while we take you back.'}
      </p>
    </main>
  );
}
