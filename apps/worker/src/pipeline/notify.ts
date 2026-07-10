import type { Mailer } from '@chess-coach/core';

/** Build + send the "your report is ready" email (spec §3.1.9, §14.10). */
export async function sendReportReadyEmail(
  mailer: Mailer,
  to: string,
  reportUrl: string,
  lichessUser: string,
): Promise<void> {
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:520px;margin:auto">
      <h1 style="color:#4F5BD5">Your chess weakness report for ${lichessUser} is ready</h1>
      <p>Hi ${lichessUser}, we analyzed your recent Lichess games and found the patterns costing you the most rating.</p>
      <p style="margin:24px 0">
        <a href="${reportUrl}"
           style="background:#4F5BD5;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">
          View ${lichessUser}'s report
        </a>
      </p>
      <p style="color:#666;font-size:13px">Or paste this link into your browser:<br>${reportUrl}</p>
    </div>`;
  const text = `Hi ${lichessUser}, your chess weakness report for ${lichessUser} is ready. View it here: ${reportUrl}`;

  await mailer.send({
    to,
    subject: `Your chess weakness report for ${lichessUser} is ready`,
    html,
    text,
  });
}
