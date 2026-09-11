/**
 * Weekly nudge email (plans/phase-2.md 2.4). Once per week per user: users who
 * have a report (so there's a plan to work on), joined before this week, and
 * have NOT checked in this week get one nudge. Idempotency rides on
 * Streak.lastNudgeWeekStart — a crash mid-scan just re-runs the scan, and the
 * upsert guarantees at most one nudge per user per week.
 */
import { isNudgeDue, weekStartFor } from '@chess-coach/core';
import type { Analytics, Mailer } from '@chess-coach/core';
import type { PrismaClient } from '@chess-coach/db';

export interface NudgeOptions {
  appUrl: string;
  /** hard cap per scan so a cold start can't blast the whole base at once */
  maxPerScan: number;
}

export interface NudgeDeps {
  db: PrismaClient;
  mailer: Mailer;
  analytics: Analytics;
}

/**
 * Scan for users due a nudge and send. Returns how many were sent.
 */
export async function sendWeeklyNudges(deps: NudgeDeps, opts: NudgeOptions, now: Date = new Date()): Promise<number> {
  const weekStart = weekStartFor(now);
  const candidates = await deps.db.user.findMany({
    where: {
      createdAt: { lt: weekStart },
      reports: { some: {} },
      checkIns: { none: { weekStart } },
      // streak is optional; a missing row means never nudged/checked-in.
      OR: [{ streak: null }, { streak: { lastNudgeWeekStart: { not: weekStart } } }],
    },
    select: { id: true, email: true, emailHash: true, streak: { select: { lastCheckInWeekStart: true, lastNudgeWeekStart: true } } },
    take: opts.maxPerScan,
    orderBy: { createdAt: 'asc' },
  });

  let sent = 0;
  for (const user of candidates) {
    // Re-check in code: the query's OR/none combo is approximate at the edges.
    if (!isNudgeDue(user.streak?.lastCheckInWeekStart ?? null, user.streak?.lastNudgeWeekStart ?? null, weekStart)) {
      continue;
    }
    const dueDrills = await deps.db.drill.count({ where: { userId: user.id, dueAt: { lte: now } } });
    try {
      await deps.mailer.send(buildNudgeEmail(user.email, opts.appUrl, dueDrills));
    } catch (err) {
      console.warn(`[nudge] send to ${user.id} failed:`, err instanceof Error ? err.message : err);
      continue; // don't mark as nudged if the send failed — retry next scan
    }
    await deps.db.streak.upsert({
      where: { userId: user.id },
      create: { userId: user.id, lastNudgeWeekStart: weekStart },
      update: { lastNudgeWeekStart: weekStart },
    });
    sent++;
  }
  if (sent > 0) console.log(`[nudge] sent ${sent} weekly nudge${sent === 1 ? '' : 's'} (week ${weekStart.toISOString().slice(0, 10)})`);
  return sent;
}

/** Source-agnostic weekly nudge (same voice as the report-ready email). */
export function buildNudgeEmail(to: string, appUrl: string, dueDrills: number): { to: string; subject: string; html: string; text: string } {
  const subject = 'How did your training week go?';
  const checkInUrl = `${appUrl}/progress`;
  const planUrl = `${appUrl}/plan`;
  const drillLine =
    dueDrills > 0
      ? `You have ${dueDrills} drill${dueDrills === 1 ? '' : 's'} due for review — a quick session keeps them fresh.`
      : 'Your review queue is clear — nice work.';
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:520px;margin:auto">
      <h1 style="color:#4F5BD5">${subject}</h1>
      <p>Two minutes is all it takes: check in for this week and keep your streak alive.</p>
      <p>${drillLine}</p>
      <p style="margin:24px 0">
        <a href="${checkInUrl}"
           style="background:#4F5BD5;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">
          Check in for this week
        </a>
      </p>
      <p style="color:#666;font-size:13px">Or start with your plan:<br>${planUrl}</p>
    </div>`;
  const text = `Weekly check-in: ${drillLine} Check in here: ${checkInUrl}`;
  return { to, subject, html, text };
}
