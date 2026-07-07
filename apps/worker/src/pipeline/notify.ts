import type { Mailer } from '@chess-coach/core';

/** Build + send the "your report is ready" email (spec §3.1.9, §14.10). */
export async function sendReportReadyEmail(
  mailer: Mailer,
  to: string,
  reportUrl: string,
): Promise<void> {
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:520px;margin:auto">
      <h1 style="color:#22694b">Your chess weakness report is ready</h1>
      <p>We analyzed your recent games and found the patterns costing you the most rating.</p>
      <p style="margin:24px 0">
        <a href="${reportUrl}"
           style="background:#2f7d5b;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">
          View my report
        </a>
      </p>
      <p style="color:#666;font-size:13px">Or paste this link into your browser:<br>${reportUrl}</p>
    </div>`;
  const text = `Your chess weakness report is ready. View it here: ${reportUrl}`;

  await mailer.send({
    to,
    subject: 'Your chess weakness report is ready',
    html,
    text,
  });
}
