'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { track } from '@/lib/track';
import { PgnGameMapper, type GameMapping, type PgnPreviewGame } from './PgnGameMapper';

interface ParseResult {
  games: PgnPreviewGame[];
  skipped: number;
  truncated: number;
}

/**
 * PGN file upload flow. Two in-memory steps: upload files → map each game's
 * orientation (mandatory) and time control (optional), then submit to create
 * the analysis job. Refreshing restarts from upload (no draft persistence).
 */
export function PgnImportForm() {
  const router = useRouter();
  const [parse, setParse] = useState<ParseResult | null>(null);
  const [mappings, setMappings] = useState<Record<string, GameMapping>>({});
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onUpload(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const input = (e.currentTarget as HTMLFormElement).elements.namedItem(
      'files',
    ) as HTMLInputElement;
    const files = input?.files ? Array.from(input.files) : [];
    if (files.length === 0) {
      setError('Choose one or more PGN files.');
      return;
    }
    setBusy(true);
    track('pgn_upload_submitted');
    try {
      const texts = await Promise.all(files.map((f) => f.text()));
      const pgn = texts.join('\n\n');
      const res = await fetch('/api/import/pgn/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pgn }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error ?? 'Could not read those files. Please try again.');
        return;
      }
      setParse(json.data as ParseResult);
      setMappings({});
    } catch {
      setError('Could not read those files. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!parse) return;
    setError(null);
    const unmapped = parse.games.filter((g) => !mappings[g.id]?.userColor);
    if (unmapped.length > 0) {
      setError('Choose which side you played for every game before continuing.');
      return;
    }
    setBusy(true);
    track('pgn_map_submitted');
    try {
      const res = await fetch('/api/import/pgn/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          consent,
          games: parse.games.map((g) => ({
            pgn: g.pgn,
            userColor: mappings[g.id]!.userColor,
            ...(mappings[g.id]?.speed ? { speed: mappings[g.id]!.speed } : {}),
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error ?? 'Something went wrong. Please try again.');
        return;
      }
      router.push(`/analyzing/${json.data.jobId}`);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (!parse) {
    return (
      <form onSubmit={onUpload} className="w-full max-w-md space-y-4">
        <div>
          <label htmlFor="files" className="block text-sm font-medium text-neutral-700">
            Upload PGN file(s)
          </label>
          <input
            id="files"
            name="files"
            type="file"
            accept=".pgn,.txt"
            multiple
            required
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-brand/10 file:px-3 file:py-1 file:text-brand-dark focus:border-brand focus:outline-none"
          />
          <p className="mt-1 text-xs text-neutral-500">
            One or more files, up to 25 games total. Each file may contain multiple games.
          </p>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-brand px-4 py-2.5 font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60"
        >
          {busy ? 'Reading…' : 'Continue'}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={onSubmit} className="w-full space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-600">
          {parse.games.length} game{parse.games.length === 1 ? '' : 's'} — set which side you
          played.
        </p>
        <button
          type="button"
          onClick={() => {
            setParse(null);
            setError(null);
          }}
          className="text-sm text-brand underline"
        >
          Start over
        </button>
      </div>

      {(parse.truncated > 0 || parse.skipped > 0) && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {parse.truncated > 0 &&
            `Only the first 25 games are analyzed — ${parse.truncated} more were left out. `}
          {parse.skipped > 0 &&
            `${parse.skipped} game${parse.skipped === 1 ? '' : 's'} couldn't be read and ${
              parse.skipped === 1 ? 'was' : 'were'
            } skipped.`}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {parse.games.map((g, i) => (
          <PgnGameMapper
            key={g.id}
            game={g}
            index={i}
            mapping={mappings[g.id] ?? {}}
            onChange={(next) => setMappings((cur) => ({ ...cur, [g.id]: next }))}
          />
        ))}
      </div>

      <div className="max-w-md space-y-4">
        <div>
          <label htmlFor="pgn-email" className="block text-sm font-medium text-neutral-700">
            Email (we&apos;ll send your report here)
          </label>
          <input
            id="pgn-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />
        </div>
        <label className="flex items-start gap-2 text-sm text-neutral-600">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-1"
            required
          />
          <span>
            I agree to the analysis of these games and to the{' '}
            <a href="/privacy" className="text-brand underline">
              privacy policy
            </a>
            .
          </span>
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-brand px-4 py-2.5 font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60"
        >
          {busy ? 'Starting…' : 'Get my free weakness report'}
        </button>
      </div>
    </form>
  );
}
