'use client';

import { track } from '@/lib/track';

/**
 * "Download PDF" via the browser's print-to-PDF (spec feedback). No server
 * infra — a print stylesheet (globals.css @media print) lays the report out for
 * paper, and the user picks "Save as PDF" in the print dialog.
 */
export function PrintButton() {
  function onClick() {
    track('report_shared', { action: 'print' });
    window.print();
  }
  return (
    <button
      onClick={onClick}
      className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:bg-neutral-100"
    >
      Download PDF
    </button>
  );
}
