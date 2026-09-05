import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { deriveTopology } from './topology';

const dimensions = fc.record({
  width: fc.integer({ min: 3, max: 8 }),
  height: fc.integer({ min: 3, max: 8 })
});

describe('generated topology invariants', () => {
  it('projects every rectangular open grid into a complete crossing topology', () => {
    fc.assert(fc.property(dimensions, ({ width, height }) => {
      const mask = Array.from({ length: height }, () => '.'.repeat(width));
      const result = deriveTopology(mask, { templateId: 'generated-open-grid' });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const { topology } = result;

      expect(topology.width).toBe(width);
      expect(topology.height).toBe(height);
      expect(topology.cells).toHaveLength(width * height);
      expect(topology.whiteCellCount).toBe(width * height);
      expect(topology.blockedCellIds).toEqual([]);
      expect(topology.entries.filter((entry) => entry.direction === 'across')).toHaveLength(height);
      expect(topology.entries.filter((entry) => entry.direction === 'down')).toHaveLength(width);
      expect(topology.slots).toEqual(topology.entries.map((entry) => ({ id: entry.id, length: entry.length })));
      expect(topology.intersections).toHaveLength(width * height);
      expect(topology.numberByCellId.size).toBe(width + height - 1);

      const intersectionKeys = new Set<string>();
      for (const intersection of topology.intersections) {
        const key = `${intersection.slotId}:${intersection.position}:${intersection.otherSlotId}:${intersection.otherPosition}`;
        intersectionKeys.add(key);
        expect(intersection.slotId).toMatch(/^A\d+-0$/);
        expect(intersection.otherSlotId).toMatch(/^D0-\d+$/);
      }
      expect(intersectionKeys.size).toBe(width * height);

      for (let row = 0; row < height; row += 1) {
        for (let column = 0; column < width; column += 1) {
          expect(topology.intersections).toContainEqual({
            slotId: `A${row}-0`,
            position: column,
            otherSlotId: `D0-${column}`,
            otherPosition: row
          });
        }
      }
    }), { numRuns: 80 });
  });
});