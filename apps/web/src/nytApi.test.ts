import { describe, expect, it, vi } from 'vitest';
import { indexPuzzle, validatePuzzle } from '@crossword/domain';
import { createNytCrosswordClient, legacyPayloadToPuzzle } from './nytApi';

function character(letters: string, options: { circled?: boolean; shaded?: boolean } = {}) {
  return {
    letters,
    is_circled: options.circled ?? false,
    is_shaded: options.shaded ?? false
  };
}

function payload() {
  return {
    metadata: {
      date: '2026-09-02',
      title: 'A Test Crossing',
      authors: ['Test Author'],
      width: 3,
      height: 3,
      notepad: null
    },
    entries: [
      { clue_number: 1, clue_text: 'First row', direction: 'across', start_x: 0, start_y: 0, characters: [character('A', { circled: true }), character('B'), character('C')] },
      { clue_number: 4, clue_text: 'Second row', direction: 'across', start_x: 0, start_y: 1, characters: [character('D'), character('E', { shaded: true }), character('F')] },
      { clue_number: 5, clue_text: 'Third row', direction: 'across', start_x: 0, start_y: 2, characters: [character('G'), character('H'), character('I')] },
      { clue_number: 1, clue_text: 'First column', direction: 'down', start_x: 0, start_y: 0, characters: [character('A'), character('D'), character('G')] },
      { clue_number: 2, clue_text: 'Second column', direction: 'down', start_x: 1, start_y: 0, characters: [character('B'), character('E'), character('H')] },
      { clue_number: 3, clue_text: 'Third column', direction: 'down', start_x: 2, start_y: 0, characters: [character('C'), character('F'), character('I')] }
    ]
  };
}

describe('NYT API adapter', () => {
  it('converts a legacy payload into a validated provider-neutral puzzle', async () => {
    const puzzle = await legacyPayloadToPuzzle(payload());
    const index = indexPuzzle(puzzle);

    expect(validatePuzzle(puzzle)).toBe(true);
    expect(puzzle.id).toBe('nyt-260902');
    expect(puzzle.cells).toHaveLength(9);
    expect(puzzle.cells.find((cell) => cell.id === 'nyt-cell-260902-0-0')?.circled).toBe(true);
    expect(puzzle.cells.find((cell) => cell.id === 'nyt-cell-260902-1-1')?.shaded).toBe(true);
    expect(index.entryAt.get('nyt-cell-260902-1-1')).toEqual({
      across: 'nyt-entry-260902-across-4',
      down: 'nyt-entry-260902-down-2'
    });
  });

  it('rejects a payload with conflicting crossing letters', async () => {
    const invalid = payload();
    const downEntry = invalid.entries[3];
    if (!downEntry) throw new Error('Test payload is missing its first down entry');
    invalid.entries[3] = {
      ...downEntry,
      characters: [character('Z'), character('D'), character('G')]
    };

    await expect(legacyPayloadToPuzzle(invalid)).rejects.toThrow('disagree at row 1, column 1');
  });

  it('loads dated and random puzzles through the legacy routes', async () => {
    const fetchImpl = vi.fn(async (url: string) => new Response(JSON.stringify(payload()), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));
    const client = createNytCrosswordClient(fetchImpl as unknown as typeof fetch, 'http://127.0.0.1:5001');

    await client.loadByDate('2026-09-02');
    await client.loadRandom('wednesday');

    expect(fetchImpl).toHaveBeenNthCalledWith(1, 'http://127.0.0.1:5001/crossword_by_date/260902', { signal: undefined });
    expect(fetchImpl).toHaveBeenNthCalledWith(2, 'http://127.0.0.1:5001/random_crossword/wednesday', { signal: undefined });
  });
});