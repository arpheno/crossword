import {
  assertValidPuzzle,
  type PuzzleDocument
} from '@crossword/domain';

export interface PuzzleRepository {
  get(id: string): Promise<PuzzleDocument | undefined>;
  list(): Promise<readonly PuzzleDocument[]>;
  publish(puzzle: PuzzleDocument): Promise<void>;
  remove(id: string): Promise<void>;
  close?: () => Promise<void>;
}

const DATABASE_NAME = 'crossword';
const DATABASE_VERSION = 3;
const PUZZLE_STORE_NAME = 'puzzle-manifests';
const SESSION_STORE_NAME = 'solve-sessions';
const EVENT_STORE_NAME = 'solve-events';
const PREFERENCES_STORE_NAME = 'preferences';
const PROFILE_STORE_NAME = 'profiles';

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

function openDatabase(factory: IDBFactory, databaseName: string): Promise<IDBDatabase> {
  const request = factory.open(databaseName, DATABASE_VERSION);
  request.onupgradeneeded = () => {
    const database = request.result;
    if (!database.objectStoreNames.contains(PUZZLE_STORE_NAME)) {
      database.createObjectStore(PUZZLE_STORE_NAME, { keyPath: 'id' });
    }
    if (!database.objectStoreNames.contains(SESSION_STORE_NAME)) {
      database.createObjectStore(SESSION_STORE_NAME, { keyPath: 'puzzleId' });
    }
    if (!database.objectStoreNames.contains(EVENT_STORE_NAME)) database.createObjectStore(EVENT_STORE_NAME, { keyPath: 'id' });
    if (!database.objectStoreNames.contains(PREFERENCES_STORE_NAME)) database.createObjectStore(PREFERENCES_STORE_NAME, { keyPath: 'id' });
    if (!database.objectStoreNames.contains(PROFILE_STORE_NAME)) database.createObjectStore(PROFILE_STORE_NAME, { keyPath: 'id' });
  };
  return requestResult(request);
}

export function createIndexedDbPuzzleRepository(
  databaseName = DATABASE_NAME,
  factory: IDBFactory | undefined = typeof indexedDB === 'undefined' ? undefined : indexedDB
): PuzzleRepository {
  if (!factory) return memoryRepository();

  const database = openDatabase(factory, databaseName);
  return {
    async get(id) {
      const connection = await database;
      const transaction = connection.transaction(PUZZLE_STORE_NAME, 'readonly');
      const complete = transactionComplete(transaction);
      const puzzle = await requestResult<PuzzleDocument | undefined>(transaction.objectStore(PUZZLE_STORE_NAME).get(id));
      await complete;
      if (puzzle) assertValidPuzzle(puzzle);
      return puzzle;
    },
    async list() {
      const connection = await database;
      const transaction = connection.transaction(PUZZLE_STORE_NAME, 'readonly');
      const complete = transactionComplete(transaction);
      const puzzles = await requestResult<PuzzleDocument[]>(transaction.objectStore(PUZZLE_STORE_NAME).getAll());
      await complete;
      puzzles.forEach(assertValidPuzzle);
      return puzzles.sort((left, right) => left.id.localeCompare(right.id));
    },
    async publish(puzzle) {
      assertValidPuzzle(puzzle);
      const connection = await database;
      const transaction = connection.transaction(PUZZLE_STORE_NAME, 'readwrite');
      transaction.objectStore(PUZZLE_STORE_NAME).put(puzzle);
      await transactionComplete(transaction);
    },
    async remove(id) {
      const connection = await database;
      const transaction = connection.transaction(PUZZLE_STORE_NAME, 'readwrite');
      transaction.objectStore(PUZZLE_STORE_NAME).delete(id);
      await transactionComplete(transaction);
    },
    async close() {
      (await database).close();
    }
  };
}