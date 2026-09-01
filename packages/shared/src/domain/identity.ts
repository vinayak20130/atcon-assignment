import parsePhoneNumberFromString, { type CountryCode } from 'libphonenumber-js';

// The deterministic dedupe keys. Pure, so they can be tested exhaustively and
// reused by the web app for client-side hints without a database client.
//
// The rule throughout: normalize only where two spellings are provably the same
// mailbox or number. Over-normalizing merges two real people, and a wrong merge
// is worse than a missed one — it exposes one candidate's history to a recruiter
// looking at another.

// Providers that ignore dots in the local part. Corporate domains are excluded
// deliberately: at acme.com, john.smith@ and johnsmith@ may be two employees.
const DOT_INSENSITIVE_DOMAINS = new Set(['gmail.com', 'googlemail.com']);

// Providers where user+tag@ routes to user@.
const PLUS_ADDRESSING_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'fastmail.com',
  'protonmail.com',
  'proton.me',
  'yahoo.com',
  'icloud.com',
]);

export interface NormalizedEmail {
  /** Lowercased and trimmed — what we show a human. */
  readonly display: string;
  /** Provider-aware canonical form — what we index for exact-match dedupe. */
  readonly key: string;
  readonly domain: string;
}

/**
 * Canonicalize an email into a dedupe key.
 *
 * Returns null for anything not shaped like an address; the caller decides
 * whether that is a validation error or simply an absent signal.
 */
export function normalizeEmail(raw: string | null | undefined): NormalizedEmail | null {
  if (!raw) return null;

  const trimmed = raw.trim().toLowerCase();
  const at = trimmed.lastIndexOf('@');
  if (at <= 0 || at === trimmed.length - 1) return null;

  let local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);

  if (!domain.includes('.') || /\s/.test(trimmed)) return null;

  if (PLUS_ADDRESSING_DOMAINS.has(domain)) {
    const plus = local.indexOf('+');
    if (plus > 0) local = local.slice(0, plus);
  }

  if (DOT_INSENSITIVE_DOMAINS.has(domain)) {
    local = local.replaceAll('.', '');
  }

  // googlemail.com and gmail.com are the same mailbox.
  const canonicalDomain = domain === 'googlemail.com' ? 'gmail.com' : domain;

  // A local part needs at least one alphanumeric. This rejects both the empty
  // string and inputs like "+@gmail.com", where stripping the tag would leave a
  // punctuation-only mailbox.
  if (!/[a-z0-9]/.test(local)) return null;

  return { display: trimmed, key: `${local}@${canonicalDomain}`, domain: canonicalDomain };
}

export interface NormalizedPhone {
  /** E.164, e.g. +919876543210 — the dedupe key. */
  readonly key: string;
  readonly country: string | undefined;
}

/**
 * Canonicalize a phone number to E.164.
 *
 * Resumes carry numbers in every imaginable format. A bare national number is
 * ambiguous without a country, so `defaultCountry` supplies the organization's.
 */
export function normalizePhone(
  raw: string | null | undefined,
  defaultCountry?: CountryCode,
): NormalizedPhone | null {
  if (!raw) return null;

  const candidate = raw.trim();
  if (candidate.length < 6) return null;

  const parsed = parsePhoneNumberFromString(candidate, defaultCountry);
  if (!parsed || !parsed.isValid()) return null;

  return { key: parsed.number, country: parsed.country };
}

/**
 * Reduce a person's name to a comparable token.
 *
 * Case, accents, punctuation and whitespace only. Deliberately does NOT reorder
 * words: asserting that "Kumar Rahul" and "Rahul Kumar" are the same person is
 * a guess, and a fuzzy scorer handles that far more safely than a normalizer
 * that silently hard-codes it.
 */
export function normalizePersonName(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Clean a person's name for display and storage.
 *
 * This is intentionally conservative: remove HTML tags, then normalize
 * whitespace. Escaping happens at render/email boundaries, but names should not
 * be stored with pasted markup in the first place.
 */
export function normalizeDisplayName(raw: string | null | undefined): string {
  return (raw ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
