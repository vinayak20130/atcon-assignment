import { normalizeEmail, normalizePersonName, normalizePhone } from './identity';

// Deterministic resume parsing: plain text in, structured fields out.
//
// Pure on purpose. Extracting text from a PDF is IO and lives in the API; every
// decision about what that text MEANS lives here, where it can be tested
// against fixture strings without a file, a worker, or a database.
//
// The governing principle is that this parser is allowed to be wrong. Real
// resumes are two-column layouts, tables and design-school typography, and a
// regex will mangle a fair share of them. So every field carries a confidence,
// nothing irreversible keys off a parsed value, and a field it cannot find is
// absent rather than guessed — a wrong employer is worse than a missing one,
// because it silently poisons any later duplicate matching.

export type FieldConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export interface ParsedField<T> {
  value: T;
  confidence: FieldConfidence;
}

export interface ParsedExperience {
  company: string;
  title: string | null;
  isCurrent: boolean;
  confidence: FieldConfidence;
}

export interface ParsedResume {
  fullName: ParsedField<string> | null;
  email: ParsedField<string> | null;
  phone: ParsedField<string> | null;
  linkedinUrl: ParsedField<string> | null;
  skills: ParsedField<string[]>;
  experiences: ParsedExperience[];
  /** Problems worth showing a recruiter rather than hiding. */
  warnings: string[];
}

export const PARSER_VERSION = 'heuristic-1';

const EMAIL_PATTERN = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
// Deliberately loose — libphonenumber does the real validation, so this only
// has to find plausible candidates. Requiring 8+ digits avoids matching years.
const PHONE_PATTERN = /(?:\+?\d[\d\s().-]{7,}\d)/g;
const LINKEDIN_PATTERN = /(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/in\/[\w-]+/i;

const DATE_TOKEN = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?\\s*\\d{4}|\\d{4}';
const DATE_RANGE = new RegExp(
  `(${DATE_TOKEN})\\s*(?:-|–|—|to)\\s*(${DATE_TOKEN}|present|current|now)`,
  'i',
);
const CURRENT_TOKENS = /\b(present|current|now)\b/i;

// A comma needs no space before it — "Senior Engineer, Acme" is the commonest
// layout — while a hyphen does, or "Hewlett-Packard" would be torn in half.
// Only the FIRST separator splits, so "Engineer, Acme, Inc." keeps the employer
// together instead of scattering it.
const TITLE_COMPANY_SEPARATOR = /\s*,\s+|\s+(?:at|@)\s+|\s*[|–—]\s+|\s+-\s+/;

const SECTION_PATTERNS: Array<[keyof Sections, RegExp]> = [
  ['experience', /^(work\s+)?(experience|employment|career\s+history)\b/i],
  ['education', /^(education|academic|qualifications)\b/i],
  ['skills', /^(technical\s+)?(skills|technologies|tech\s+stack)\b/i],
  ['summary', /^(summary|profile|objective|about)\b/i],
];

interface Sections {
  header: string[];
  experience: string[];
  education: string[];
  skills: string[];
  summary: string[];
}

// A heading is short. Length is the load-bearing check: "Experience building
// payment systems at scale" starts with the word Experience but is plainly a
// sentence, and treating it as a header would swallow the rest of the resume.
function detectSection(line: string): keyof Sections | null {
  const trimmed = line.trim();
  if (trimmed.length === 0 || trimmed.length > 40) return null;
  for (const [section, pattern] of SECTION_PATTERNS) {
    if (pattern.test(trimmed)) return section;
  }
  return null;
}

function splitIntoSections(lines: string[]): Sections {
  const sections: Sections = { header: [], experience: [], education: [], skills: [], summary: [] };
  let current: keyof Sections = 'header';

  for (const line of lines) {
    const detected = detectSection(line);
    if (detected) {
      current = detected;
      continue;
    }
    sections[current].push(line);
  }
  return sections;
}

// Almost always the first substantial line. Confidence drops when the line does
// not look like a name, because the alternative — guessing confidently —
// produces a candidate filed under "CURRICULUM VITAE".
function extractName(headerLines: string[]): ParsedField<string> | null {
  const RESUME_WORDS = /\b(resume|curriculum\s+vitae|cv|profile)\b/i;

  for (const line of headerLines.slice(0, 6)) {
    const trimmed = line.trim();
    if (trimmed.length < 3 || trimmed.length > 60) continue;
    if (RESUME_WORDS.test(trimmed) || EMAIL_PATTERN.test(trimmed)) continue;
    if (/\d/.test(trimmed) || trimmed.includes('@') || trimmed.includes('http')) continue;

    const words = trimmed.split(/\s+/);
    if (words.length < 2 || words.length > 5) continue;

    const looksLikeName = words.every(
      (word) => /^[A-Z][a-zA-Z.'-]*$/.test(word) || /^[A-Z.'-]+$/.test(word),
    );
    return { value: trimmed, confidence: looksLikeName ? 'HIGH' : 'MEDIUM' };
  }
  return null;
}

function splitTitleAndCompany(text: string): { title: string | null; company: string } {
  const match = TITLE_COMPANY_SEPARATOR.exec(text);
  if (!match || match.index === 0) return { title: null, company: text.trim() };
  return {
    title: text.slice(0, match.index).trim(),
    company: text.slice(match.index + match[0].length).trim(),
  };
}

// The reliable anchor is a date range, so entries are found by locating dates
// and reading the surrounding lines. Layout varies enormously, so confidence
// reflects how much of the entry was actually recovered rather than asserting
// the guess was right.
function extractExperiences(lines: string[]): ParsedExperience[] {
  const experiences: ParsedExperience[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const dateMatch = DATE_RANGE.exec(line);
    if (!dateMatch) continue;

    const withoutDates = line.replace(DATE_RANGE, '').replace(/[|•·,–—-]+\s*$/, '').trim();
    const previous = (lines[index - 1] ?? '').trim();

    const source =
      withoutDates.length > 2
        ? withoutDates
        : previous.length > 2 && !DATE_RANGE.test(previous)
          ? previous
          : '';
    if (!source) continue;

    const { title, company } = splitTitleAndCompany(source.replace(/^[-*•\s]+/, ''));
    if (company.length < 2 || company.length > 100) continue;

    experiences.push({
      company,
      title: title && title.length <= 80 ? title : null,
      isCurrent: CURRENT_TOKENS.test(dateMatch[2] ?? ''),
      // A company AND a title is a well-formed entry; a company alone is
      // plausible but thinner.
      confidence: title ? 'MEDIUM' : 'LOW',
    });
  }

  return experiences.slice(0, 15);
}

function extractSkills(skillLines: string[]): ParsedField<string[]> {
  const joined = skillLines.join(', ');
  if (joined.trim().length === 0) return { value: [], confidence: 'LOW' };

  const skills = joined
    .split(/[,;|•·\n]+/)
    .map((skill) => skill.replace(/^[-*\s]+/, '').replace(/^[A-Za-z ]+:\s*/, '').trim())
    .filter((skill) => skill.length >= 2 && skill.length <= 30 && /[a-zA-Z]/.test(skill));

  const unique = [...new Set(skills)].slice(0, 40);
  // A dedicated skills section is a strong signal; scraping from prose is not.
  return { value: unique, confidence: unique.length > 0 ? 'HIGH' : 'LOW' };
}

/**
 * Parse extracted resume text into structured fields.
 *
 * Never throws. A resume it cannot make sense of yields mostly-empty output
 * with warnings attached — the application still succeeds and a recruiter fills
 * the gaps, which is the entire reason parsing happens in a worker rather than
 * in the request.
 */
export function parseResumeText(
  text: string,
  options: { defaultCountry?: string } = {},
): ParsedResume {
  const warnings: string[] = [];
  const lines = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return {
      fullName: null,
      email: null,
      phone: null,
      linkedinUrl: null,
      skills: { value: [], confidence: 'LOW' },
      experiences: [],
      warnings: ['No text could be extracted. The file may be a scan or image-only PDF.'],
    };
  }

  const sections = splitIntoSections(lines);
  const flat = lines.join('\n');

  const emailMatch = EMAIL_PATTERN.exec(flat);
  const normalizedEmail = emailMatch ? normalizeEmail(emailMatch[0]) : null;

  // Only an E.164-valid number counts. A resume full of dates and postcodes
  // offers plenty of digit runs that are not phone numbers.
  let phone: ParsedField<string> | null = null;
  for (const candidate of flat.match(PHONE_PATTERN) ?? []) {
    const normalized = normalizePhone(candidate, options.defaultCountry as never);
    if (normalized) {
      phone = { value: normalized.key, confidence: 'HIGH' };
      break;
    }
  }

  const linkedinMatch = LINKEDIN_PATTERN.exec(flat);
  const fullName = extractName(sections.header.length > 0 ? sections.header : lines);

  if (!normalizedEmail) warnings.push('No email address found in the resume text.');
  if (!fullName) warnings.push('Could not identify a name; the layout may be unusual.');

  const experiences = extractExperiences(
    sections.experience.length > 0 ? sections.experience : lines,
  );

  if (sections.experience.length === 0) {
    warnings.push('No experience section detected; employment history may be incomplete.');
  } else if (experiences.length === 0) {
    warnings.push('An experience section was found but no dated roles could be read from it.');
  }

  return {
    fullName,
    email: normalizedEmail ? { value: normalizedEmail.display, confidence: 'HIGH' } : null,
    phone,
    linkedinUrl: linkedinMatch
      ? {
          value: linkedinMatch[0].startsWith('http')
            ? linkedinMatch[0]
            : `https://${linkedinMatch[0]}`,
          confidence: 'HIGH',
        }
      : null,
    skills: extractSkills(sections.skills),
    experiences,
    warnings,
  };
}
