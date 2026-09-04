import { describe, expect, it } from 'vitest';
import { applyLearnerPreferences } from './constructPuzzle';
import type { FillCandidate } from './constructPuzzle';

function candidate(word: string, score: number): FillCandidate {
  return {
    word,
    score,
    role: 'general',
    intendedSense: 'fixture sense',
    associations: [],
    clue: undefined,
    qualityScore: score
  } as unknown as FillCandidate;
}

const input = [candidate('ARGENTINA', 0.9), candidate('BRAZIL', 0.6), candidate('CHILE', 0.3)];

const aggressiveProfile = {
  theta: 1,
  nowMs: 0,
  memory: {
    ARGENTINA: { stability: 1, lastReviewAtMs: -30 * 86_400_000 },
    CHILE: { stability: 900, lastReviewAtMs: 0 }
  }
};

describe('learner preference never bypasses hard constraints (PP-P1-3, ADR 0008)', () => {
  it('reorders candidates but never changes the candidate set or eligibility', () => {
    const withProfile = applyLearnerPreferences(input, aggressiveProfile, 0.9);

    // Same set: preference may reorder and reweight, never add, drop, or
    // mutate the vocabulary that hard constraints will consider.
    expect([...withProfile].map((candidate) => candidate.word).sort()).toEqual([...input].map((candidate) => candidate.word).sort());
    expect(withProfile).toHaveLength(input.length);

    // Scores remain bounded preferences, not eligibility overrides: the blend
    // keeps every candidate inside 0..1 so downstream hard constraints
    // (lexicon legality, CSP feasibility, editorial rules) stay authoritative.
    for (const candidate of withProfile) {
      expect(candidate.score).toBeGreaterThanOrEqual(0);
      expect(candidate.score).toBeLessThanOrEqual(1);
      expect(Number.isFinite(candidate.score)).toBe(true);
    }
  });

  it('keeps neutral (no-profile) behavior identical to the baseline ordering', () => {
    const neutral = applyLearnerPreferences(input, undefined, 0.9);
    expect(neutral.map((candidate) => candidate.word)).toEqual(input.map((candidate) => candidate.word));
    expect(neutral.map((candidate) => candidate.score)).toEqual(input.map((candidate) => candidate.score));
  });

  it('is deterministic for a fixed seed, profile, and ordering', () => {
    const first = applyLearnerPreferences(input, aggressiveProfile);
    const second = applyLearnerPreferences(input, aggressiveProfile);
    expect(first).toEqual(second);
  });
});
