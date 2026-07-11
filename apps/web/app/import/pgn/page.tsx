import type { Metadata } from 'next';
import { BrandLogo } from '@/components/BrandLogo';
import { PgnImportForm } from '@/components/PgnImportForm';

export const metadata: Metadata = { title: 'Analyze your PGN games' };

/**
 * Full-width host for the PGN upload flow. The homepage import panel is a
 * narrow column, which cramps the per-game mapping boards + steppers, so the
 * flow lives on its own wide page.
 */
export default function PgnImportPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-8">
        <BrandLogo height={40} />
      </div>
      <h1 className="text-2xl font-bold">Analyze your PGN games</h1>
      <p className="mt-1 max-w-2xl text-neutral-600">
        Upload up to 25 games — no Lichess account needed. You&apos;ll tell us which side you played
        for each game, then we&apos;ll find the patterns costing you the most rating.
      </p>
      <div className="mt-6">
        <PgnImportForm />
      </div>
    </main>
  );
}
