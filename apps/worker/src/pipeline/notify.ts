import type { Mailer } from '@chess-coach/core';

/**
 * Build + send the "your report is ready" email (spec §3.1.9, §14.10). Kept
 * source-agnostic (no username, no "Lichess") so it reads correctly for every
 * import flow — live games, studies, and PGN uploads alike.
 */
export async function sendReportReadyEmail(
  mailer: Mailer,
  to: string,
  reportUrl: string,
): Promise<void> {
  const subject = 'Your chess weakness report is ready';
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:520px;margin:auto">
      <h1 style="color:#4F5BD5">${subject}</h1>
      <p>Hi, we analyzed your games and found the patterns costing you the most rating.</p>
      <p style="margin:24px 0">
        <a href="${reportUrl}"
           style="background:#4F5BD5;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">
          View your report
        </a>
      </p>
      <p style="color:#666;font-size:13px">Or paste this link into your browser:<br>${reportUrl}</p>
    </div>`;
  const text = `Hi, your chess weakness report is ready. View it here: ${reportUrl}`;

  await mailer.send({ to, subject, html, text });
}
