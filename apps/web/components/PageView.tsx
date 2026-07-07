'use client';

import { useEffect } from 'react';
import { track, type ClientEvent } from '@/lib/track';

/** Fires a funnel event once on mount (e.g. landing_view, report_viewed). */
export function PageView({ event, props }: { event: ClientEvent; props?: Record<string, unknown> }) {
  useEffect(() => {
    track(event, props);
  }, [event, props]);
  return null;
}
