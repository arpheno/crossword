import { describe, expect, it } from 'vitest';

import { solveFill, type FillCandidate, type FillRequest } from './csp';

const candidate = (word: string, score: number): FillCandidate => ({
  word,
  score,
  lexemeId: `align:${word}`,
  sourceIds: ['alignment-fixture']
});

/**
 * Objective-alignment witness (review 3.8 spec 4 / 2.1): the search-time
 * poor-entry constraint (a hard editorial floor) must dominate the raw-sum
 * optimizer. The raw-sum-optimal path crosses through a sub-floor entry; the
 * engine must return the compliant, lower-sum fill on the SAME template
 * instead of publishing an incumbent the editorial gate would reject.
 *
 * Score units are raw candidate preference (the floor is applied on the same
 * scale the caller uses for `poorEntryFloor` — in production, the 0..1
 * staple scale).
 */
describe('objective alignment (review 3.8 spec 4)', () => {
  const request: FillRequest = {
    slots: [
      { id: 'choice', length: 3 },
      { id: 'plain', length: 4 }
    ],
    intersections: [{ slotId: 'choice', position: 0, otherSlotId: 'plain', otherPosition: 0 }],
    candidates: [
      // Raw-sum-optimal path: JAB(0.4, sub-floor) + JETS(2.5) = 2.9 — the sum
      // optimizer prefers it, but JAB is below the 0.5 editorial floor.
      candidate('JAB', 0.4),
      candidate('JETS', 2.5),
      // Compliant path: CAR(0.6) + CARE(0.7) = 1.3 — lower sum, no poor entry.
      candidate('CAR', 0.6),
      candidate('CARE', 0.7)
    ],
    poorEntryFloor: 0.5,
    poorEntryLimit: 0
  };

  it('the engine refuses the raw-sum-optimal path when it carries a poor entry', () => {
    const result = solveFill(request);
    expect(result.status).toBe('solved');
    if (result.status !== 'solved' || !result.solution) return;
    const words = Object.values(result.solution.assignments).map((entry) => entry.word);
    expect(words).not.toContain('JAB');
    expect(words).toContain('CAR');
    expect(result.solution.score).toBeCloseTo(1.3);
  });

  it('without the constraint the raw-sum optimizer picks the poor path', () => {
    const unconstrained = solveFill({ ...request, poorEntryLimit: undefined, poorEntryFloor: undefined });
    expect(unconstrained.status).toBe('solved');
    if (unconstrained.status !== 'solved' || !unconstrained.solution) return;
    const words = Object.values(unconstrained.solution.assignments).map((entry) => entry.word);
    expect(words).toContain('JAB');
    expect(unconstrained.solution.score).toBeCloseTo(2.9);
  });

  it('relaxing the limit to one readmits the poor path', () => {
    const result = solveFill({ ...request, poorEntryLimit: 1 });
    expect(result.status).toBe('solved');
    if (result.status !== 'solved' || !result.solution) return;
    const words = Object.values(result.solution.assignments).map((entry) => entry.word);
    expect(words).toContain('JAB');
    expect(result.solution.score).toBeCloseTo(2.9);
  });

  it('counts poor entries from quality scores instead of ranking boosts', () => {
    const result = solveFill({
      ...request,
      candidates: [
        { ...candidate('JAB', 2.5), qualityScore: 0.4 },
        { ...candidate('JETS', 2.5), qualityScore: 1 },
        { ...candidate('CAR', 0.6), qualityScore: 0.6 },
        { ...candidate('CARE', 0.7), qualityScore: 0.7 }
      ]
    });
    expect(result.status).toBe('solved');
    if (result.status !== 'solved' || !result.solution) return;
    const words = Object.values(result.solution.assignments).map((entry) => entry.word);
    expect(words).not.toContain('JAB');
    expect(words).toContain('CAR');
    expect(result.solution.score).toBeCloseTo(1.3);
  });
});
