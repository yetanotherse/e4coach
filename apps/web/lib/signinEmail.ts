/** Shared sign-in email composition (magic link + OTP) used by auth routes and signup. */
import type { Mailer } from '@chess-coach/core';

const BRAND = 'e4coach';

export async function sendMagicLinkEmail(
  mailer: Mailer,
  to: string,
  link: string,
  subject = `Your ${BRAND} sign-in link`,
): Promise<void> {
  await mailer.send({
    to,
    subject,
    html: `<p>Click to sign in and see your reports:</p>
           <p><a href="${link}">Sign in to ${BRAND}</a></p>
           <p style="color:#666;font-size:13px">This link expires in 15 minutes.</p>`,
    text: `Sign in to ${BRAND}: ${link}`,
  });
}

export async function sendOtpEmail(mailer: Mailer, to: string, code: string): Promise<void> {
  await mailer.send({
    to,
    subject: `Your ${BRAND} sign-in code`,
    html: `<p>Your sign-in code is:</p>
           <p style="font-size:28px;font-weight:bold;letter-spacing:4px">${code}</p>
           <p style="color:#666;font-size:13px">This code expires in 10 minutes and can be used once.</p>`,
    text: `Your ${BRAND} sign-in code: ${code} (expires in 10 minutes)`,
  });
}
