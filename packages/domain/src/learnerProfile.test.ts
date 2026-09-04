import { describe, expect, it } from 'vitest';
import { neutralLearnerProfile, parseLearnerProfile, profileForConstruction, resetLearnerProfile } from './learnerProfile';

const valid = {
  schemaVersion: 1 as const,
  id: 'household-1',
  consent: 'local-personalization' as const,
  updatedAt: '2026-09-04T00:00:00.000Z',
  clueStylePreferences: { direct: 0.4 },
  topicPreferences: { ecology: -0.2 },
  repetition: { recentAnswerIds: ['CAT'], avoidUntilByAnswerId: { DOG: '2026-09-05T00:00:00.000Z' } }
};

describe('learner profile v1 schema (PP-P1-1, ADR 0008)', () => {
  it('accepts a valid profile and preserves every field', () => {
    const parsed = parseLearnerProfile(valid);
    expect(parsed).toEqual(valid);
  });

  it('rejects unknown fields, bad consent, out-of-range weights, and malformed timestamps', () => {
    expect(parseLearnerProfile({ ...valid, extra: 1 })).toBeUndefined();
    expect(parseLearnerProfile({ ...valid, consent: 'always-on' })).toBeUndefined();
    expect(parseLearnerProfile({ ...valid, clueStylePreferences: { direct: 2 } })).toBeUndefined();
    expect(parseLearnerProfile({ ...valid, topicPreferences: { ecology: 'high' } })).toBeUndefined();
    expect(parseLearnerProfile({ ...valid, updatedAt: 'yesterday' })).toBeUndefined();
    expect(parseLearnerProfile({ ...valid, repetition: { ...valid.repetition, recentAnswerIds: [''] } })).toBeUndefined();
    expect(parseLearnerProfile({ ...valid, schemaVersion: 2 })).toBeUndefined();
    expect(parseLearnerProfile(null)).toBeUndefined();
  });

  it('defaults to a neutral, consent-disabled profile', () => {
    const neutral = neutralLearnerProfile('household-1', '2026-09-04T00:00:00.000Z');
    expect(neutral.consent).toBe('disabled');
    expect(neutral.clueStylePreferences).toEqual({});
    expect(neutral.topicPreferences).toEqual({});
    expect(neutral.repetition.recentAnswerIds).toEqual([]);
    expect(parseLearnerProfile(neutral)).toEqual(neutral);
  });

  it('resets every retained category back to neutral', () => {
    const reset = resetLearnerProfile(parseLearnerProfile(valid)!, '2026-09-06T00:00:00.000Z');
    expect(reset.consent).toBe('disabled');
    expect(reset.clueStylePreferences).toEqual({});
    expect(reset.topicPreferences).toEqual({});
    expect(reset.repetition).toEqual({ recentAnswerIds: [], avoidUntilByAnswerId: {} });
    expect(reset.id).toBe(valid.id);
    expect(reset.updatedAt).toBe('2026-09-06T00:00:00.000Z');
  });

  it('never hands construction a personalization payload yet (neutral behavior is complete)', () => {
    expect(profileForConstruction(parseLearnerProfile(valid))).toBeUndefined();
    expect(profileForConstruction(undefined)).toBeUndefined();
  });
});
