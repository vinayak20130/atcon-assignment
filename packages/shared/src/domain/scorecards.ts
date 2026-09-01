import {
  InterviewStatus,
  OPEN_INTERVIEW_STATUSES,
  RECOMMENDATION_WEIGHT,
  type Recommendation,
} from '../enums';

// Structured interview feedback: what a scorecard must contain to count, who is
// allowed to read one, and when an outstanding scorecard blocks the pipeline.
//
// Pure, like the state machine next door. Every rule here is a decision about
// hiring process rather than about storage, so none of it should need a
// database to test — and the anchoring rule in particular is the kind of thing
// that must be provably right rather than probably right.

export interface CriterionRef {
  readonly id: string;
  readonly label: string;
  /** Relative weight when collapsing a scorecard to one number. */
  readonly weight: number;
  readonly maxRating: number;
}

export interface RatingInput {
  readonly criterionId: string;
  readonly rating: number;
  readonly notes?: string | null;
}

export const ScorecardError = {
  UNKNOWN_CRITERION: 'UNKNOWN_CRITERION',
  DUPLICATE_CRITERION: 'DUPLICATE_CRITERION',
  MISSING_CRITERION: 'MISSING_CRITERION',
  RATING_OUT_OF_RANGE: 'RATING_OUT_OF_RANGE',
} as const;
export type ScorecardError = (typeof ScorecardError)[keyof typeof ScorecardError];

export type RatingValidation =
  | { readonly valid: true }
  | { readonly valid: false; readonly code: ScorecardError; readonly message: string };

/**
 * Check a submitted set of ratings against the template it claims to answer.
 *
 * Submission is all-or-nothing: a scorecard missing half its criteria is worse
 * than no scorecard, because it looks like considered feedback while being an
 * unfinished draft. Drafts are saved without passing through here.
 */
export function validateRatings(
  criteria: readonly CriterionRef[],
  ratings: readonly RatingInput[],
): RatingValidation {
  const byId = new Map(criteria.map((criterion) => [criterion.id, criterion]));
  const seen = new Set<string>();

  for (const rating of ratings) {
    const criterion = byId.get(rating.criterionId);
    if (!criterion) {
      return {
        valid: false,
        code: ScorecardError.UNKNOWN_CRITERION,
        message: `Criterion ${rating.criterionId} is not part of this scorecard.`,
      };
    }
    if (seen.has(rating.criterionId)) {
      return {
        valid: false,
        code: ScorecardError.DUPLICATE_CRITERION,
        message: `${criterion.label} was rated more than once.`,
      };
    }
    seen.add(rating.criterionId);

    // Integers only, and 0 is not a rating — the scales start at 1 so that "not
    // answered" and "answered badly" cannot collide on the same value.
    if (!Number.isInteger(rating.rating) || rating.rating < 1 || rating.rating > criterion.maxRating) {
      return {
        valid: false,
        code: ScorecardError.RATING_OUT_OF_RANGE,
        message: `${criterion.label} must be rated 1-${criterion.maxRating}.`,
      };
    }
  }

  const missing = criteria.find((criterion) => !seen.has(criterion.id));
  if (missing) {
    return {
      valid: false,
      code: ScorecardError.MISSING_CRITERION,
      message: `${missing.label} has not been rated.`,
    };
  }

  return { valid: true };
}

/**
 * Collapse ratings into one comparable number, normalized to 0-1.
 *
 * Normalized because criteria do not share a scale: a 3/5 and a 6/10 are the
 * same performance, and averaging the raw numbers would quietly rank the
 * ten-point criterion twice as important as its weight says.
 */
export function summarizeScorecard(
  criteria: readonly CriterionRef[],
  ratings: readonly RatingInput[],
): number | null {
  const byId = new Map(criteria.map((criterion) => [criterion.id, criterion]));
  let weighted = 0;
  let totalWeight = 0;

  for (const rating of ratings) {
    const criterion = byId.get(rating.criterionId);
    if (!criterion || criterion.weight <= 0 || criterion.maxRating < 1) continue;
    weighted += (rating.rating / criterion.maxRating) * criterion.weight;
    totalWeight += criterion.weight;
  }

  return totalWeight > 0 ? weighted / totalWeight : null;
}

export interface ScorecardRef {
  readonly id: string;
  readonly interviewerId: string;
  /** Null while a draft. Submission is what makes it readable by the panel. */
  readonly submittedAt: Date | null;
}

export interface Viewer {
  readonly id: string;
  /** A recruiter reads the panel to decide; an interviewer reads it to compare. */
  readonly isRecruiter: boolean;
}

/**
 * Which scorecards on one interview this viewer may read.
 *
 * The rule that matters: an interviewer cannot see a colleague's verdict until
 * their own is submitted. Reading "Strong Yes, brilliant on system design"
 * before writing your own does not inform your judgement, it replaces it —
 * anchoring bias is well enough established that a hiring tool should design
 * against it rather than leave it to etiquette.
 *
 * Their own draft is always visible; the restriction is on other people's, and
 * it lifts the moment they commit to a verdict of their own. Recruiters are
 * exempt because they are collating rather than scoring, and somebody has to be
 * able to see a panel that has stalled.
 */
export function visibleScorecards(
  viewer: Viewer,
  scorecards: readonly ScorecardRef[],
): readonly ScorecardRef[] {
  if (viewer.isRecruiter) {
    // Even a recruiter does not read unsubmitted drafts. A half-written
    // scorecard is a thought in progress, not a record.
    return scorecards.filter((card) => card.submittedAt !== null);
  }

  const ownSubmitted = scorecards.some(
    (card) => card.interviewerId === viewer.id && card.submittedAt !== null,
  );

  return scorecards.filter(
    (card) =>
      card.interviewerId === viewer.id || (ownSubmitted && card.submittedAt !== null),
  );
}

export interface PanelistRef {
  readonly userId: string;
  /** Backups and observers are invited but owe nothing. */
  readonly isRequired: boolean;
}

export interface InterviewRef {
  readonly id: string;
  readonly status: InterviewStatus;
  readonly panelists: readonly PanelistRef[];
  readonly scorecards: readonly ScorecardRef[];
}

/**
 * How many required scorecards are still outstanding across these interviews.
 *
 * This is the number the pipeline state machine gates a forward move on. A
 * cancelled interview owes nothing, and neither does a no-show: the candidate
 * never appeared, so demanding feedback would strand the application in a stage
 * nobody can clear.
 */
export function countPendingScorecards(interviews: readonly InterviewRef[]): number {
  let pending = 0;

  for (const interview of interviews) {
    if (!OPEN_INTERVIEW_STATUSES.includes(interview.status)) continue;

    const submitted = new Set(
      interview.scorecards
        .filter((card) => card.submittedAt !== null)
        .map((card) => card.interviewerId),
    );

    for (const panelist of interview.panelists) {
      if (panelist.isRequired && !submitted.has(panelist.userId)) pending += 1;
    }
  }

  return pending;
}

/**
 * The panel's aggregate lean, or null when nobody has submitted.
 *
 * Deliberately not a hiring decision — it is a summary a human reads. Averaging
 * verdicts is a reasonable way to see where a panel sits and a terrible way to
 * decide, so nothing in the system branches on this value.
 */
export function panelLean(recommendations: readonly Recommendation[]): number | null {
  if (recommendations.length === 0) return null;
  const total = recommendations.reduce((sum, value) => sum + RECOMMENDATION_WEIGHT[value], 0);
  return total / recommendations.length;
}

/** Interviews in these statuses can still be scored. */
export function acceptsScorecards(status: InterviewStatus): boolean {
  return status === InterviewStatus.SCHEDULED || status === InterviewStatus.COMPLETED;
}
