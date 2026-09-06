/**
 * Versioned local learner profile (ADR 0008, PP-P0-1 / PP-P1-1).
 *
 * Deliberately minimal: this schema carries consent and manually inspectable
 * preference/repetition records only. No field is INFERRED from behavior yet —
 * per the review contract, a field may be inferred only after its source-event
 * coverage and calibration test exist. Until then neutral (no-profile)
 * behavior is the complete product behavior.
 *
 * Privacy rules enforced by this module and ADR 0008:
 * - raw audio is never persisted anywhere;
 * - transcripts are not retained (default: none);
 * - the profile is local-only household data and never leaves the device
 *   except through an explicit user-initiated continuity export.
 */

export type LearnerConsent = 'disabled' | 'local-personalization';

/** Preference weights are bounded to [-1, 1] (negative = prefer less). */
export type PreferenceWeight = number;

export type LearnerProfileV1 = Readonly<{
  schemaVersion: 1;
  id: string;
  consent: LearnerConsent;
  /** ISO-8601 timestamp of the last change. */
  updatedAt: string;
  clueStylePreferences: Readonly<Record<string, PreferenceWeight>>;
  topicPreferences: Readonly<Record<string, PreferenceWeight>>;
  repetition: Readonly<{
    recentAnswerIds: readonly string[];
    avoidUntilByAnswerId: Readonly<Record<string, string>>;
  }>;
}>;

const MAX_PREFERENCE_ENTRIES = 64;
const MAX_RECENT_ANSWERS = 50;
const MAX_AVOID_UNTIL = 200;
const ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPreferenceMap(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  if (keys.length > MAX_PREFERENCE_ENTRIES) return false;
  return keys.every((key) => key.length > 0 && key.length <= 64 && typeof value[key] === 'number' && Number.isFinite(value[key]) && (value[key] as number) >= -1 && (value[key] as number) <= 1);
}

function isRepetition(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (Object.keys(value).some((key) => !['recentAnswerIds', 'avoidUntilByAnswerId'].includes(key))) return false;
  const recent = value.recentAnswerIds;
  if (!Array.isArray(recent) || recent.length > MAX_RECENT_ANSWERS || !recent.every((id) => typeof id === 'string' && id.length > 0 && id.length <= 64)) return false;
  const avoid = value.avoidUntilByAnswerId;
  if (!isRecord(avoid)) return false;
  const keys = Object.keys(avoid);
  if (keys.length > MAX_AVOID_UNTIL) return false;
  return keys.every((key) => key.length > 0 && key.length <= 64 && typeof avoid[key] === 'string' && ISO_PATTERN.test(avoid[key]));
}

/**
 * Strict parse: unknown fields, wrong versions, invalid weights, bad consent
 * values, and malformed timestamps are rejected so shape drift cannot sneak
 * into storage or exports.
 */
export function parseLearnerProfile(value: unknown): LearnerProfileV1 | undefined {
  if (!isRecord(value)) return undefined;
  const allowed = new Set(['schemaVersion', 'id', 'consent', 'updatedAt', 'clueStylePreferences', 'topicPreferences', 'repetition']);
  if (Object.keys(value).some((key) => !allowed.has(key))) return undefined;
  if (value.schemaVersion !== 1) return undefined;
  if (typeof value.id !== 'string' || value.id.length === 0 || value.id.length > 64) return undefined;
  if (value.consent !== 'disabled' && value.consent !== 'local-personalization') return undefined;
  if (typeof value.updatedAt !== 'string' || !ISO_PATTERN.test(value.updatedAt)) return undefined;
  if (!isPreferenceMap(value.clueStylePreferences) || !isPreferenceMap(value.topicPreferences)) return undefined;
  if (!isRepetition(value.repetition)) return undefined;
  return {
    schemaVersion: 1,
    id: value.id,
    consent: value.consent,
    updatedAt: value.updatedAt,
    clueStylePreferences: value.clueStylePreferences as LearnerProfileV1['clueStylePreferences'],
    topicPreferences: value.topicPreferences as LearnerProfileV1['topicPreferences'],
    repetition: value.repetition as LearnerProfileV1['repetition']
  };
}

/** Neutral profile: consent off, no invented preferences (PP-P1-1). */
export function neutralLearnerProfile(id: string, updatedAt: string): LearnerProfileV1 {
  return {
    schemaVersion: 1,
    id,
    consent: 'disabled',
    updatedAt,
    clueStylePreferences: {},
    topicPreferences: {},
    repetition: { recentAnswerIds: [], avoidUntilByAnswerId: {} }
  };
}

/** Complete reset: every retained category returns to the neutral profile. */
export function resetLearnerProfile(profile: LearnerProfileV1, updatedAt: string): LearnerProfileV1 {
  return neutralLearnerProfile(profile.id, updatedAt);
}

/**
 * Consent gate for the construction path (PP-P0-1). The current schema has no
 * validated mapping into the FSRS memory profile, so construction receives an
 * explicit `undefined` (no personalization) until a calibrated rule exists —
 * neutral behavior stays the only behavior and no UI may claim
 * personalization.
 */
export function profileForConstruction(profile: LearnerProfileV1 | undefined): undefined {
  void profile;
  return undefined;
}
