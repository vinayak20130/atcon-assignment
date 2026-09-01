import { UnprocessableEntityException } from '@nestjs/common';

export interface ValidatedUpload {
  buffer: Buffer;
  filename: string;
  /** The type proven by the file's own bytes, not the one the client claimed. */
  mimeType: string;
}

// PDF only.
//
// Word support would mean a second extraction path (mammoth for .docx, and
// nothing usable for legacy .doc), for a format almost nobody sends a resume in
// any more. Accepting a file we cannot read would be worse than refusing it:
// the candidate would think it went through and the recruiter would get a
// blank profile.
const ACCEPTED_MIME = 'application/pdf';

// %PDF-
const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d];

/**
 * Is this actually a PDF?
 *
 * Checked against the file's own bytes, because Content-Type and the extension
 * are both attacker-controlled — a candidate can name anything resume.pdf and
 * declare any type. The bytes are the only evidence.
 */
export function isPdf(buffer: Buffer): boolean {
  return (
    buffer.length >= PDF_SIGNATURE.length &&
    PDF_SIGNATURE.every((byte, index) => buffer[index] === byte)
  );
}

/**
 * Validate an uploaded resume.
 *
 * Order matters: size is checked first because it is free, and rejecting a
 * 400 MB upload should not require inspecting it.
 */
export function validateResumeUpload(
  file: { buffer: Buffer; originalname: string; mimetype: string } | undefined,
  limits: { maxBytes: number },
): ValidatedUpload {
  if (!file || file.buffer.length === 0) {
    throw new UnprocessableEntityException('Attach your resume as a PDF.');
  }

  if (file.buffer.length > limits.maxBytes) {
    const maxMb = Math.round(limits.maxBytes / (1024 * 1024));
    throw new UnprocessableEntityException(
      `That file is larger than ${maxMb} MB. Send a smaller PDF.`,
    );
  }

  if (!isPdf(file.buffer)) {
    throw new UnprocessableEntityException({
      message: 'Resumes must be a PDF.',
      // The declared type is reported back too: a mismatch is usually an honest
      // mistake (a .docx renamed), and saying so beats "invalid file".
      declaredType: file.mimetype,
    });
  }

  return {
    buffer: file.buffer,
    filename: file.originalname || 'resume.pdf',
    mimeType: ACCEPTED_MIME,
  };
}

/**
 * Reduce a candidate-supplied filename to something safe.
 *
 * Allow-list rather than deny-list: keep letters, digits, dot, underscore and
 * hyphen, drop everything else. A deny-list would have to anticipate path
 * separators, control characters, quotes, and whatever encoding trick comes
 * next; an allow-list cannot be surprised.
 */
export function sanitizeFilename(filename: string): string {
  const base = filename.split(/[/\\]/).pop() ?? 'document';
  const cleaned = base
    .replace(/\s+/g, '-')
    .replace(/[^A-Za-z0-9._-]/g, '')
    .replace(/^\.+/, '')
    .slice(0, 120);
  return cleaned.length > 0 ? cleaned : 'document';
}
