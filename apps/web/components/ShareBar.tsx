'use client';

import { useState } from 'react';
import { track } from '@/lib/track';

export function ShareBar() {
  const [copied, setCopied] = useState(false);

  async function onShare() {
    track('report_shared');
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <button
      onClick={onShare}
      className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:bg-neutral-100"
    >
      {copied ? 'Link copied!' : 'Share report'}
    </button>
  );
}
