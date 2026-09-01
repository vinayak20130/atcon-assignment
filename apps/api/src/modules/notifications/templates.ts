// Email bodies, as pure functions.
//
// No Nest, no Prisma, no transport — a template takes plain data and returns a
// subject and two renderings. That keeps the wording testable, and keeps the
// decision about what a candidate is told separate from the machinery that
// delivers it.

import { SUPPORT_EMAIL, CAL_LINK, BRAND_NAME } from '../../common/constants';

export interface RenderedMail {
  subject: string;
  text: string;
  html: string;
}

/**
 * Everything interpolated below is user input — a candidate types their own
 * name, a recruiter types the job title. Escaping is not optional even in
 * email: mail clients render HTML, and an unescaped apostrophe-and-angle
 * bracket is at best a mangled greeting.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const SIGNATURE = `The ${BRAND_NAME} Hiring Team`;

function layout(heading: string, paragraphs: string[]): string {
  const body = paragraphs.map((line) => `<p style="margin:0 0 16px">${line}</p>`).join('\n      ');
  return `<!doctype html>
<html>
  <body style="margin:0;background:#f6f6f4;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1a1a18">
    <div style="max-width:520px;margin:0 auto;padding:32px 24px">
      <h1 style="font-size:19px;font-weight:600;margin:0 0 20px">${heading}</h1>
      ${body}
      <p style="margin:28px 0 0;font-size:13px;color:#6b6b64">${SIGNATURE}</p>
      <p style="margin:8px 0 0;font-size:12px;color:#9b9b94">
        Questions? Reply to this email or write to <a href="mailto:${SUPPORT_EMAIL}" style="color:#1a5fd0">${SUPPORT_EMAIL}</a>.
        Want to talk? <a href="${CAL_LINK}" style="color:#1a5fd0">Book a 15-min call</a>.
      </p>
    </div>
  </body>
</html>`;
}

export interface ApplicationReceivedData {
  candidateName: string;
  jobTitle: string;
  companyName: string;
}

export function applicationReceived(data: ApplicationReceivedData): RenderedMail {
  const name = escapeHtml(data.candidateName);
  const job = escapeHtml(data.jobTitle);
  const company = escapeHtml(data.companyName);

  return {
    subject: `We received your application for ${data.jobTitle}`,
    // No promised timeline. A date the team cannot keep is worse than no date,
    // and this is the email candidates screenshot.
    text: [
      `Hi ${data.candidateName},`,
      '',
      `Thanks for applying for ${data.jobTitle} at ${data.companyName}. Your application is in front of the hiring team.`,
      '',
      'We will be in touch when there is news, either way.',
      '',
      SIGNATURE,
    ].join('\n'),
    html: layout(`Thanks for applying, ${name}`, [
      `Your application for <strong>${job}</strong> at ${company} is in front of the hiring team.`,
      'We will be in touch when there is news, either way.',
    ]),
  };
}

export interface InterviewScheduledData {
  candidateName: string;
  jobTitle: string;
  interviewTitle: string;
  startsAt: Date;
  timezone: string;
  meetingUrl?: string | null;
}

export function interviewScheduled(data: InterviewScheduledData): RenderedMail {
  const when = formatWhen(data.startsAt, data.timezone);
  const name = escapeHtml(data.candidateName);
  const job = escapeHtml(data.jobTitle);
  const round = escapeHtml(data.interviewTitle);

  const joinLine = data.meetingUrl
    ? `Join here: ${data.meetingUrl}`
    : 'A calendar invitation with the joining link is on its way separately.';

  return {
    subject: `Your ${data.interviewTitle} is confirmed for ${when}`,
    text: [
      `Hi ${data.candidateName},`,
      '',
      `Your ${data.interviewTitle} for ${data.jobTitle} is confirmed.`,
      '',
      `When: ${when}`,
      joinLine,
      '',
      'If that time no longer works, reply to this email and we will find another.',
      '',
      SIGNATURE,
    ].join('\n'),
    html: layout(`Your interview is confirmed, ${name}`, [
      `<strong>${round}</strong> for ${job}.`,
      `<strong>${escapeHtml(when)}</strong>`,
      data.meetingUrl
        ? `<a href="${encodeURI(data.meetingUrl)}" style="color:#1a5fd0">Join the call</a>`
        : 'A calendar invitation with the joining link is on its way separately.',
      'If that time no longer works, reply to this email and we will find another.',
    ]),
  };
}

export interface ApplicationRejectedData {
  candidateName: string;
  jobTitle: string;
  companyName: string;
}

/**
 * Deliberately short, and it does not explain.
 *
 * A generic reason reads worse than none, and a specific one invites a debate
 * the team is not equipped to have at volume. The internal rejection reason
 * stays in the audit trail, where it belongs.
 */
export function applicationRejected(data: ApplicationRejectedData): RenderedMail {
  const name = escapeHtml(data.candidateName);
  const job = escapeHtml(data.jobTitle);
  const company = escapeHtml(data.companyName);

  return {
    subject: `Your application for ${data.jobTitle}`,
    text: [
      `Hi ${data.candidateName},`,
      '',
      `Thank you for the time you put into applying for ${data.jobTitle} at ${data.companyName}.`,
      '',
      'We are not taking your application further on this occasion. That is a decision about one role at one moment, and we would be glad to see you apply again.',
      '',
      SIGNATURE,
    ].join('\n'),
    html: layout(`Thank you, ${name}`, [
      `Thank you for the time you put into applying for <strong>${job}</strong> at ${company}.`,
      'We are not taking your application further on this occasion. That is a decision about one role at one moment, and we would be glad to see you apply again.',
    ]),
  };
}

/**
 * Rendered in the interview's own timezone, with the zone named.
 *
 * "3pm" without a zone is the classic way to lose a candidate who is in a
 * different one, and the server's timezone is nobody's.
 */
export function formatWhen(startsAt: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
      timeZone: timezone,
    }).format(startsAt);
  } catch {
    // An invalid IANA zone must not cost the candidate their invitation.
    return `${startsAt.toISOString()} (UTC)`;
  }
}
