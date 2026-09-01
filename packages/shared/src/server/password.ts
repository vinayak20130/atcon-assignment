import bcrypt from 'bcrypt';

// bcrypt.compare reads the cost back out of the stored `$2b$<cost>$...` string,
// so raising this only affects new hashes — old ones keep verifying at the cost
// they were written with.
const COST = 12;

// bcrypt silently ignores anything past 72 bytes, so a longer password would
// authenticate on its first 72 alone. Reject instead of truncating. Bytes, not
// characters — one 'é' costs two.
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

// Returns false rather than throwing on a corrupt stored hash: that should fail
// the login, not the request.
export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  // No hash this module produced can correspond to an over-length password.
  if (exceedsBcryptLimit(password)) return false;
  try {
    return await bcrypt.compare(password, encoded);
  } catch {
    return false;
  }
}
