/**
 * Global application constants.
 *
 * Centralised here so a branding or routing change is a one-line edit, not a
 * grep through every file. These are environment-independent values — they are
 * not secrets and do not belong in .env.
 */

/** Candidate-facing support address, shown in email footers and error pages. */
export const SUPPORT_EMAIL = 'vinayak@moneyticks.com';

/**
 * Cal.com booking link for a discovery / intro call.
 * Shown to candidates when they want to talk before applying, and to
 * recruiters when composing custom outreach.
 */
export const CAL_LINK = 'https://cal.com/vinayakits30/15min';

/** Brand name used in email subjects and headings. */
export const BRAND_NAME = 'MoneyTicks';
