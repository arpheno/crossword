import { describe, expect, it } from 'vitest';
import {
  createFixturePuzzle,
  createRealPuzzle,
  deriveEntryNumbers,
  getCellPosition,
  getEntryForCell,
  indexPuzzle,
  isSupportedCrosswordAnswer,
  normalizeCrosswordAnswer,
  parsePuzzle,
  serializePuzzle,
  validatePuzzle
} from './puzzle';

describe('puzzle domain', () => {
  it('normalizes crossword surfaces and identifies the supported alphabet', () => {
    expect(normalizeCrosswordAnswer('ice-cream')).toBe('ICECREAM');
    expect(isSupportedCrosswordAnswer('ice cream')).toBe(true);
    expect(isSupportedCrosswordAnswer('cafe4')).toBe(false);
  });

  it('creates a provider-neutral fixture with stable cells and entries', () => {
    const puzzle = createFixturePuzzle();
    const index = indexPuzzle(puzzle);

    expect(puzzle.createdBy).toBe('synthetic-fixture');
    expect(puzzle.cells).toHaveLength(16);
    expect(puzzle.entries).toHaveLength(8);
    expect(index.cellsById.get(puzzle.cells[0]!.id)?.circled).toBe(true);
  });

  it('indexes crossing entries without relying on clue text', () => {
    const puzzle = createFixturePuzzle();
    const index = indexPuzzle(puzzle);
    const cellId = puzzle.cells[0]?.id;

    if (!cellId) {
      throw new Error('Fixture did not create a first cell');
    }

    const across = getEntryForCell(index, cellId, 'across');
    const down = getEntryForCell(index, cellId, 'down');

    expect(across?.direction).toBe('across');
    expect(down?.direction).toBe('down');
    expect(getCellPosition(across!, cellId)).toBe(0);
  });

  it('rejects a cell that is not part of an entry', () => {
    const puzzle = createFixturePuzzle();
    const entry = puzzle.entries[0];

    if (!entry) {
      throw new Error('Fixture did not create an entry');
    }

    expect(() => getCellPosition(entry, 'missing-cell' as never)).toThrow(
      'does not belong'
    );
  });

  it('derives shared clue numbers from entry start coordinates', () => {
    const puzzle = createFixturePuzzle();
    const numbers = deriveEntryNumbers(puzzle);
    const firstCell = puzzle.cells[0]?.id;

    expect(firstCell).toBeDefined();
    expect(numbers.get(firstCell!)).toBe(1);
    expect(puzzle.entries.filter((entry) => entry.number === 1)).toHaveLength(2);
    expect(indexPuzzle(puzzle).numberByCellId.get('cell-1-0' as never)).toBe(5);
  });

  it('round-trips a validated manifest without changing identity', () => {
    const puzzle = createFixturePuzzle();
    const restored = parsePuzzle(serializePuzzle(puzzle));

    expect(validatePuzzle(restored)).toBe(true);
    expect(restored).toEqual(puzzle);
  });

  it('rejects malformed topology before it can be indexed', () => {
    const puzzle = createFixturePuzzle();
    const firstEntry = puzzle.entries[0];
    if (!firstEntry) throw new Error('Fixture did not create an entry');
    const malformed = {
      ...puzzle,
      entries: puzzle.entries.map((entry) =>
        entry.id === firstEntry.id
          ? { ...entry, cellIds: [entry.cellIds[0]!, entry.cellIds[2]!, entry.cellIds[1]!, entry.cellIds[3]!] }
          : entry
      )
    };

    expect(validatePuzzle(malformed)).toBe(false);
    expect(() => indexPuzzle(malformed)).toThrow('Invalid puzzle manifest');
  });

  it('creates and round-trips the real 15x15 crossword', () => {
    const puzzle = createRealPuzzle();
    const restored = parsePuzzle(serializePuzzle(puzzle));
    const index = indexPuzzle(puzzle);

    expect(validatePuzzle(puzzle)).toBe(true);
    expect(puzzle.width).toBe(15);
    expect(puzzle.height).toBe(15);
    expect(puzzle.cells).toHaveLength(225);
    expect(puzzle.cells.filter((cell) => cell.block)).toHaveLength(38);
    expect(puzzle.entries).toHaveLength(78);
    expect(puzzle.entries.filter((entry) => entry.direction === 'across')).toHaveLength(41);
    expect(puzzle.entries.filter((entry) => entry.direction === 'down')).toHaveLength(37);
    expect(index.entryAt.get('real-cell-7-7')).toEqual({
      across: expect.any(String),
      down: expect.any(String)
    });
    expect(puzzle.provenance.source).toBe('local-construction');
    expect(puzzle.provenance.records).toHaveLength(2);
    expect(puzzle.integrity.value).toMatch(/^[a-f0-9]{64}$/);
    expect(restored).toEqual(puzzle);
  });
});
