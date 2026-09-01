import { Injectable, Logger } from '@nestjs/common';
import { PARSER_VERSION, type ParsedResume, parseResumeText } from '@atcon/shared';

export interface ParseResult {
  parsed: ParsedResume;
  /** The extracted text, kept so a better parser can run later without the file. */
  rawText: string;
  parserVersion: string;
}

// The port every resume parser implements.
//
// Declared as an abstract class with one implementation on purpose. The
// realistic production answer is a vendor API or an LLM extraction pass, and
// both are a swap behind this seam rather than a rewrite. Keeping the seam
// while shipping only the deterministic implementation is the honest version of
// "we could upgrade this" — the boundary exists and is used.
export abstract class ResumeParser {
  abstract parse(input: { buffer: Buffer; defaultCountry?: string }): Promise<ParseResult>;
}

// Deterministic parsing: extract text, then apply the pure heuristics in
// @atcon/shared.
//
// Chosen over an LLM pass so the demo runs offline, the tests are exact, and
// the interesting logic is visible in the repository rather than in a prompt.
// The cost is documented: two-column layouts and image-only PDFs come back
// thin, which is exactly why every field carries a confidence.
@Injectable()
export class HeuristicResumeParser extends ResumeParser {
  private readonly logger = new Logger(HeuristicResumeParser.name);

  async parse(input: { buffer: Buffer; defaultCountry?: string }): Promise<ParseResult> {
    const rawText = await this.extractText(input.buffer);
    return {
      parsed: parseResumeText(rawText, { defaultCountry: input.defaultCountry }),
      rawText,
      parserVersion: PARSER_VERSION,
    };
  }

  /**
   * Get text out of the PDF.
   *
   * Returns an empty string rather than throwing when extraction fails. A
   * corrupt or image-only file is a normal outcome here, not an exception: the
   * pure parser turns empty text into a result carrying a warning, the
   * application survives, and a recruiter fills the gaps. Throwing would send
   * the job to the dead-letter queue for something no retry can fix.
   */
  private async extractText(buffer: Buffer): Promise<string> {
    let parser: { getText(): Promise<{ text?: string }>; destroy?(): Promise<void> } | null = null;
    try {
      // pdf-parse v2 exports a class rather than the callable v1 shipped. It
      // also holds a worker open until destroy(), so the handle is released in
      // `finally` — leaking one per parsed resume would eventually exhaust the
      // worker process.
      const { PDFParse } = require('pdf-parse') as {
        PDFParse: new (options: { data: Buffer }) => {
          getText(): Promise<{ text?: string }>;
          destroy?(): Promise<void>;
        };
      };
      parser = new PDFParse({ data: buffer });
      const result = await parser.getText();
      return result.text ?? '';
    } catch (error) {
      this.logger.warn(`Text extraction failed: ${(error as Error).message}`);
      return '';
    } finally {
      await parser?.destroy?.().catch(() => undefined);
    }
  }
}
