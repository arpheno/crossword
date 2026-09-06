import { describe, expect, it } from 'vitest';

import { solveFill, type FillCandidate } from './csp';

const candidate = (word: string, score: number): FillCandidate => ({
  word,
  score,
  lexemeId: `anytime:${word}`,
  sourceIds: ['anytime-fixture']
});

// A 3-slot path: A - B - C with A-B and B-C crossings.
function chainRequest(): {
  slots: { id: string; length: number }[];
  intersections: { slotId: string; position: number; otherSlotId: string; otherPosition: number }[];
  candidates: FillCandidate[];
} {
  return {
    slots: [
      { id: 'left', length: 3 },
      { id: 'middle', length: 4 },
      { id: 'right', length: 3 }
    ],
    intersections: [
      { slotId: 'left', position: 2, otherSlotId: 'middle', otherPosition: 0 },
      { slotId: 'right', position: 0, otherSlotId: 'middle', otherPosition: 3 }
    ],
    candidates: [
      // left: CAT/EAT end in T or ...; middle anchors; right starts with S
      candidate('CAT', 3),
      candidate('EAT', 2),
      candidate('COT', 1),
      candidate('TOSS', 2),
      candidate('TOTE', 1),
      candidate('SAG', 2),
      candidate('SET', 3)
    ]
  };
}

describe('anytime contract (review 3.8 spec 3)', () => {
  it('distinguishes exhaustion (proven optimal) from first-acceptable stopping', () => {
    const exhaustive = solveFill(chainRequest());
    expect(exhaustive.status).toBe('solved');
    expect(exhaustive.termination).toBe('exhausted');
    expect(exhaustive.provenOptimal).toBe(true);
    if (exhaustive.status !== 'solved') return;
    // Optimum: CAT(3) + TOSS(2) + SET(3)? CAT..T/.S? middle 'TOSS' starts T ends S:
    // left ends T (CAT), right starts S (SET). Sum = 3+2+3 = 8.
    expect(exhaustive.solution?.score).toBe(8);
    expect(exhaustive.solution?.nodes).toBeGreaterThan(0);
  });

  it('first-acceptable mode reports satisfied and is not claimed optimal', () => {
    const result = solveFill({ ...chainRequest(), minimumAssignmentScore: 1 });
    expect(result.status).toBe('solved');
    expect(result.termination).toBe('satisfied');
    expect(result.provenOptimal).toBe(false);
    if (result.status !== 'solved' || !result.solution) return;
    // First acceptable fill must still be a complete valid assignment.
    expect(Object.keys(result.solution.assignments).sort()).toEqual(['left', 'middle', 'right']);
  });

  it('node limit after an incumbent is an anytime result, not unsatisfiable', () => {
    const result = solveFill({ ...chainRequest(), maxNodes: 2 });
    // With a 2-node budget the search may or may not have an incumbent; when
    // it does, status is solved with termination node-limit. Either way the
    // termination reason must be reported and distinct from unsatisfiable.
    expect(result.termination).toBe('node-limit');
    if (result.status === 'solved') {
      expect(result.provenOptimal).toBe(false);
      expect(result.solution?.nodes).toBeLessThanOrEqual(2);
    } else {
      expect(result.failure?.code).toBe('resource-limit');
    }
  });

  it('exhausted search without any incumbent is unsatisfiable, proven so', () => {
    const result = solveFill({
      ...chainRequest(),
      candidates: [candidate('XXX', 1), candidate('YYYY', 1), candidate('ZZZ', 1)]
    });
    expect(result.status).toBe('failed');
    expect(result.termination).toBe('unsatisfiable');
    expect(result.provenOptimal).toBeUndefined();
  });
});
