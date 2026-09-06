import {
  assertValidPuzzle,
  type PuzzleDocument
} from '@crossword/domain';
import { openCrosswordDatabase, STORE_NAMES, type DatabaseHandle } from './database';

export interface PuzzleRepository {
  get(id: string): Promise<PuzzleDocument | undefined>;
  list(): Promise<readonly PuzzleDocument[]>;
  publish(puzzle: PuzzleDocument): Promise<void>;
  remove(id: string): Promise<void>;
  close?: () => Promise<void>;
}

const DATABASE_NAME = 'crossword';

function memoryRepository(): PuzzleRepository {
  const puzzles = new Map<string, PuzzleDocument>();
  return {
    get: async (id) => puzzles.get(id),
    list: async () => [...puzzles.values()],
    publish: async (puzzle) => {
      assertValidPuzzle(puzzle);
      puzzles.set(puzzle.id, puzzle);
    },
    remove: async (id) => {
      puzzles.delete(id);
    },
    close: async () => undefined
  };
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
  });
}

export function createIndexedDbPuzzleRepository(
  databaseName = DATABASE_NAME,
  factory: IDBFactory | undefined = typeof indexedDB === 'undefined' ? undefined : indexedDB
): PuzzleRepository {
  if (!factory) return memoryRepository();

  let handlePromise: Promise<DatabaseHandle> | undefined;
  const openHandle = () => {
    handlePromise ??= openCrosswordDatabase(factory, databaseName);
    return handlePromise;
  };

  return {
    async get(id) {
      const handle = await openHandle();
      const transaction = handle.connection.transaction(STORE_NAMES.puzzles, 'readonly');
      const complete = transactionComplete(transaction);
      const puzzle = await requestResult<PuzzleDocument | undefined>(transaction.objectStore(STORE_NAMES.puzzles).get(id));
      await complete;
      if (puzzle) assertValidPuzzle(puzzle);
      return puzzle;
    },
    async list() {
      const handle = await openHandle();
      const transaction = handle.connection.transaction(STORE_NAMES.puzzles, 'readonly');
      const complete = transactionComplete(transaction);
      const puzzles = await requestResult<PuzzleDocument[]>(transaction.objectStore(STORE_NAMES.puzzles).getAll());
      await complete;
      puzzles.forEach(assertValidPuzzle);
      return puzzles.sort((left, right) => left.id.localeCompare(right.id));
    },
    async publish(puzzle) {
      assertValidPuzzle(puzzle);
      const handle = await openHandle();
      const transaction = handle.connection.transaction(STORE_NAMES.puzzles, 'readwrite');
      transaction.objectStore(STORE_NAMES.puzzles).put(puzzle);
      await transactionComplete(transaction);
    },
    async remove(id) {
      const handle = await openHandle();
      const transaction = handle.connection.transaction(STORE_NAMES.puzzles, 'readwrite');
      transaction.objectStore(STORE_NAMES.puzzles).delete(id);
      await transactionComplete(transaction);
    },
    async close() {
      if (!handlePromise) return;
      (await handlePromise).close();
    }
  };
}
