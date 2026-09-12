import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Sora, DM_Sans } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import './globals.css';

const display = Sora({ subsets: ['latin'], weight: ['600', '700'], variable: '--font-display' });
const body = DM_Sans({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-body' });

export const metadata: Metadata = {
  title: 'e4coach — your free personal chess weakness report',
  description:
    'Turn your own Lichess games and studies into a clear, personal report of the weaknesses costing you rating.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
