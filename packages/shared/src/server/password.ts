import bcrypt from 'bcrypt';

/**
 * Password hashing with bcrypt.
 *
 * The encoded hash is self-describing — `$2b$<cost>$<salt><digest>` carries the
 * algorithm, cost, and salt, and `bcrypt.compare` reads the cost back out of the
 * stored value. Raising COST therefore affects new hashes only; existing ones
 * keep verifying at the cost they were written with.
 */
const COST = 12;

/**
 * bcrypt hashes at most 72 bytes and silently ignores the rest, so a longer
 * password would authenticate on its first 72 bytes alone. Both functions
 * reject past that instead of truncating.
 *
 * Note this is a *byte* limit, not a character one — a multi-byte character
 * costs more than one byte against it.
 */
const MAX_PASSWORD_BYTES = 72;

export class PasswordTooLongError extends Error {
  constructor() {
    super(`Password must be at most ${MAX_PASSWORD_BYTES} bytes.`);
    this.name = 'PasswordTooLongError';
  }
}

function exceedsBcryptLimit(password: string): boolean {
  return Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES;
}

/** @throws {PasswordTooLongError} if the password exceeds 72 bytes. */
export async function hashPassword(password: string): Promise<string> {
  if (exceedsBcryptLimit(password)) throw new PasswordTooLongError();
  return bcrypt.hash(password, COST);
}

/**
 * Verify a password against an encoded hash.
 *
 * Returns false rather than throwing on a malformed stored hash — a corrupt row
 * should fail the login, not the request. The comparison is constant-time.
 */
export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  // No hash this module produced can correspond to an over-length password.
  if (exceedsBcryptLimit(password)) return false;
  try {
    return await bcrypt.compare(password, encoded);
  } catch {
    return false;
  }
}
