'use client';

import { useState } from 'react';
import { SignupForm } from './SignupForm';
import { StudyImportForm } from './StudyImportForm';

type Mode = 'games' | 'studies';

const TABS: { id: Mode; label: string }[] = [
  { id: 'games', label: 'Recent games' },
  { id: 'studies', label: 'My studies' },
];

export function ImportPanel({ studyError }: { studyError?: string }) {
  const [mode, setMode] = useState<Mode>('games');

  return (
    <div>
      <div className="mb-4 flex gap-1 rounded-lg bg-neutral-100 p-1 text-sm">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setMode(t.id)}
            className={`flex-1 rounded-md px-3 py-1.5 font-medium transition ${
              mode === t.id ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {studyError && mode === 'studies' && (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {studyErrorMessage(studyError)}
        </p>
      )}

      {mode === 'games' ? <SignupForm /> : <StudyImportForm />}
    </div>
  );
}

function studyErrorMessage(code: string): string {
  switch (code) {
    case 'none':
      return 'No importable games found in your Lichess studies. Add games to a study via "Import game" so they include player info, then try again.';
    case 'denied':
      return 'Lichess authorization was declined.';
    case 'fetch':
      return "We couldn't read your studies from Lichess. Please try again.";
    default:
      return 'Something went wrong with the Lichess import. Please try again.';
  }
}
