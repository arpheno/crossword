import 'fake-indexeddb/auto';
import { createFixturePuzzle, createSession, indexPuzzle } from '@crossword/domain';
import { describe, expect, it } from 'vitest';
import { createIndexedDbSessionRepository } from './sessionRepository';
import { createIndexedDbPuzzleRepository } from './puzzleRepository';
import { createContinuityExport } from './archive';
import { createIndexedDbContinuityRepository } from './continuityRepository';

function createLegacyDatabase(databaseName: string, snapshot: ReturnType<typeof createSession>): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('solve-sessions', { keyPath: 'puzzleId' });
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction('solve-sessions', 'readwrite');
      const { checkedCellIds, revealedCellIds, clueVariantByEntryId, events, lastClockAtMs, lastInteractionAtMs, paused, assistanceCount, status, ...legacy } = snapshot;
      transaction.objectStore('solve-sessions').put(legacy);
      transaction.oncomplete = () => {
        database.close();
        resolve();
      };
      transaction.onerror = () => reject(transaction.error);
    };
  });
}

describe('session repository', () => {
  it('round-trips snapshots through the fallback adapter when IndexedDB is unavailable', async () => {
    const puzzle = createFixturePuzzle();
    const snapshot = createSession(puzzle, indexPuzzle(puzzle), 123);
    const repository = createIndexedDbSessionRepository('memory-test', undefined);

    await repository.save(snapshot);

    expect(await repository.load(snapshot.puzzleId)).toEqual(snapshot);
    await repository.remove(snapshot.puzzleId);
    expect(await repository.load(snapshot.puzzleId)).toBeUndefined();
  });

  it('stores validated puzzle manifests through the fallback adapter', async () => {
    const puzzle = createFixturePuzzle();
    const repository = createIndexedDbPuzzleRepository('memory-puzzles', undefined);

    await repository.publish(puzzle);

    expect(await repository.get(puzzle.id)).toEqual(puzzle);
    expect(await repository.list()).toEqual([puzzle]);
    await repository.remove(puzzle.id);
    expect(await repository.get(puzzle.id)).toBeUndefined();
  });

  it('rejects malformed snapshots at the persistence boundary', async () => {
    const repository = createIndexedDbSessionRepository('invalid-session', undefined);

    await expect(repository.save({ puzzleId: 'invalid' } as never)).rejects.toThrow('invalid solve session');
  });

  it('migrates a version-one session and stores puzzles in IndexedDB', async () => {
    const databaseName = `indexed-db-${Date.now()}`;
    const puzzle = createFixturePuzzle();
    const snapshot = createSession(puzzle, indexPuzzle(puzzle), 123);
    await createLegacyDatabase(databaseName, snapshot);

    const sessionRepository = createIndexedDbSessionRepository(databaseName);
    const puzzleRepository = createIndexedDbPuzzleRepository(databaseName);
    const migrated = await sessionRepository.load(puzzle.id);
    await puzzleRepository.publish(puzzle);

    expect(migrated?.puzzleId).toBe(puzzle.id);
    expect(migrated?.events).toEqual([]);
    expect(migrated?.paused).toBe(false);
    expect(await puzzleRepository.get(puzzle.id)).toEqual(puzzle);
  });

  it('commits valid archives atomically and preserves the old state on rejection', async () => {
    const databaseName = `continuity-db-${Date.now()}`;
    const puzzle = createFixturePuzzle();
    const session = createSession(puzzle, indexPuzzle(puzzle), 123);
    const archive = await createContinuityExport({
      preferences: { theme: 'light' },
      profiles: {},
      puzzles: [puzzle],
      sessions: [session]
    }, '2026-08-30T00:00:00.000Z');
    const repository = createIndexedDbContinuityRepository(databaseName);

    await repository.replace(archive);
    expect(await createIndexedDbSessionRepository(databaseName).load(puzzle.id)).toEqual(session);

    const tampered = archive.replace('A Small Beginning', 'Changed');
    await expect(repository.replace(tampered)).rejects.toThrow('integrity');
    expect(await createIndexedDbSessionRepository(databaseName).load(puzzle.id)).toEqual(session);
  });
});
