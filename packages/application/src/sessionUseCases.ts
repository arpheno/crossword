import {
  assertValidPuzzle,
  createSession,
  type CellId,
  type PuzzleDocument,
  type PuzzleIndex,
  type SolveSessionSnapshot,
  validateSessionSnapshot
} from '@crossword/domain';
import type { SessionRepository } from '@crossword/persistence';

export type SessionUseCases = Readonly<{
  load: (puzzle: PuzzleDocument, index: PuzzleIndex, nowMs?: number) => Promise<SolveSessionSnapshot>;
  save: (puzzle: PuzzleDocument, index: PuzzleIndex, snapshot: SolveSessionSnapshot) => Promise<void>;
  restart: (puzzle: PuzzleDocument, index: PuzzleIndex, nowMs?: number) => SolveSessionSnapshot;
  restore: (puzzle: PuzzleDocument, index: PuzzleIndex, snapshot: unknown) => SolveSessionSnapshot;
}>;

function isCompatible(
  puzzle: PuzzleDocument,
  index: PuzzleIndex,
  snapshot: unknown
): snapshot is SolveSessionSnapshot {
  if (!validateSessionSnapshot(snapshot) || snapshot.puzzleId !== puzzle.id) return false;
  const entry = index.entriesById.get(snapshot.selection.entryId);
  if (!entry || entry.direction !== snapshot.selection.direction || !entry.cellIds.includes(snapshot.selection.cellId)) return false;
  const knownCell = (cellId: string) => index.cellsById.has(cellId as CellId);
  return Object.keys(snapshot.entered).every(knownCell)
    && snapshot.checkedCellIds.every(knownCell)
    && snapshot.revealedCellIds.every(knownCell);
}

export function createSessionUseCases(repository: SessionRepository): SessionUseCases {
  return {
    async load(puzzle, index, nowMs = Date.now()) {
      assertValidPuzzle(puzzle);
      const stored = await repository.load(puzzle.id);
      return isCompatible(puzzle, index, stored) ? stored : createSession(puzzle, index, nowMs);
    },
    async save(puzzle, index, snapshot) {
      assertValidPuzzle(puzzle);
      if (!isCompatible(puzzle, index, snapshot)) throw new Error('Cannot save a session for a different or incompatible puzzle');
      await repository.save(snapshot);
    },
    restart(puzzle, index, nowMs = Date.now()) {
      assertValidPuzzle(puzzle);
      return createSession(puzzle, index, nowMs);
    },
    restore(puzzle, index, snapshot) {
      assertValidPuzzle(puzzle);
      if (!isCompatible(puzzle, index, snapshot)) throw new Error('Imported session is incompatible with this puzzle');
      return snapshot;
    }
  };
}
