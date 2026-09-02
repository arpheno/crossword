import {
  createFixturePuzzle,
  createSession,
  indexPuzzle,
  type CellId,
  type SolveSessionSnapshot
} from '@crossword/domain';
import type { SessionRepository } from '@crossword/persistence';
import { describe, expect, it } from 'vitest';
import { createSessionUseCases } from './sessionUseCases';

function memoryRepository(stored?: SolveSessionSnapshot): SessionRepository {
  let current = stored;
  return {
    load: async () => current,
    save: async (snapshot) => {
      current = snapshot;
    },
    remove: async () => {
      current = undefined;
    }
  };
}

describe('session use cases', () => {
  it('starts clean when storage contains a stale selection', async () => {
    const puzzle = createFixturePuzzle();
    const index = indexPuzzle(puzzle);
    const stale = { ...createSession(puzzle, index), selection: { ...createSession(puzzle, index).selection, cellId: 'missing-cell' as CellId } };
    const useCases = createSessionUseCases(memoryRepository(stale));

    const loaded = await useCases.load(puzzle, index, 900);

    expect(loaded.startedAtMs).toBe(900);
    expect(loaded.selection.cellId).toBe('cell-0-0');
  });

  it('rejects restoring a session for another puzzle', () => {
    const puzzle = createFixturePuzzle();
    const index = indexPuzzle(puzzle);
    const useCases = createSessionUseCases(memoryRepository());
    const foreign = { ...createSession(puzzle, index), puzzleId: 'other-puzzle' };

    expect(() => useCases.restore(puzzle, index, foreign)).toThrow('incompatible');
  });

  it('only saves a validated session compatible with the puzzle index', async () => {
    const puzzle = createFixturePuzzle();
    const index = indexPuzzle(puzzle);
    const repository = memoryRepository();
    const useCases = createSessionUseCases(repository);
    const session = createSession(puzzle, index);

    await useCases.save(puzzle, index, session);
    await expect(useCases.save(puzzle, index, { ...session, puzzleId: 'other-puzzle' })).rejects.toThrow('incompatible');
    expect(await repository.load(puzzle.id)).toEqual(session);
  });
});
