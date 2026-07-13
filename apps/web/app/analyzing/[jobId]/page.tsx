'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

const STAGE_LABEL: Record<string, string> = {
  PENDING: 'Queued…',
  FETCHING: 'Importing your recent games…',
  EVALUATING: 'Reviewing every move with the engine…',
  CLASSIFYING: 'Finding your weakness patterns…',
  GENERATING: 'Writing your report…',
  DONE: 'Done!',
  FAILED: 'Something went wrong.',
};

/** What to show while the job is still waiting to be picked up by the worker. */
function queueMessage(queueAhead: number, workerBusy: boolean): string {
  if (queueAhead > 0) {
    return `Waiting in queue — ${queueAhead} ${queueAhead === 1 ? 'analysis is' : 'analyses are'} ahead of yours.`;
  }
  if (workerBusy) return "You're next — the engine is finishing another analysis.";
  return 'Starting your analysis…';
}

/** Map internal job errors to user-friendly messages. */
function friendlyJobError(raw?: string): string {
  const e = (raw ?? '').toLowerCase();
  if (e.includes('no games')) {
    return "We couldn't find any games to analyze. Please try again with a different selection.";
  }
  if (e.includes('lichess username')) {
    return 'We couldn’t identify your chess account. Please start again from the home page.';
  }
  return 'Your analysis didn’t finish. Please try again in a moment.';
}

export default function AnalyzingPage({ params }: { params: { jobId: string } }) {
  const router = useRouter();
  const [status, setStatus] = useState('PENDING');
  const [stage, setStage] = useState<string | null>(null);
  const [lichessUser, setLichessUser] = useState<string | null>(null);
  const [queueAhead, setQueueAhead] = useState(0);
  const [workerBusy, setWorkerBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const res = await fetch(`/api/job/${params.jobId}`);
        const json = await res.json();
        if (!active) return;
        if (!json.ok) {
          setError('We lost track of this analysis. Please try again.');
          return;
        }
        setStatus(json.data.status);
        setStage(json.data.stage);
        setLichessUser(json.data.lichessUser ?? null);
        setQueueAhead(json.data.queueAhead ?? 0);
        setWorkerBusy(Boolean(json.data.workerBusy));
        if (json.data.status === 'DONE' && json.data.reportSlug) {
          router.push(`/report/${json.data.reportSlug}`);
          return;
        }
        if (json.data.status === 'FAILED') {
          // Show a friendly message; don't surface raw internal errors.
          setError(friendlyJobError(json.data.error));
          return;
        }
        timer = setTimeout(poll, 2000);
      } catch {
        if (active) timer = setTimeout(poll, 3000);
      }
    };
    let timer: ReturnType<typeof setTimeout>;
    poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [params.jobId, router]);

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center px-6 text-center">
      {!error ? (
        <>
          <div className="mb-6 h-12 w-12 animate-spin rounded-full border-4 border-neutral-200 border-t-brand" />
          <h1 className="text-2xl font-semibold">
            Analyzing {lichessUser ? `${lichessUser}'s games` : 'your games'}
          </h1>
          <p className="mt-2 text-neutral-600">
            {status === 'PENDING'
              ? queueMessage(queueAhead, workerBusy)
              : (stage ?? STAGE_LABEL[status] ?? 'Working…')}
          </p>
          <p className="mt-8 text-xs text-neutral-400">
            This might take a few minutes depending on number of games and analysis needed. You can
            safely leave — we&apos;ll email your report when it&apos;s ready.
          </p>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-semibold text-red-600">We hit a snag</h1>
          <p className="mt-2 text-neutral-600">{error}</p>
          <a href="/" className="mt-6 rounded-lg bg-brand px-4 py-2 font-medium text-white">
            Try again
          </a>
        </>
      )}
    </main>
  );
}
