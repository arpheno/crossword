import { parseContinuityExport } from './archive';

export interface ContinuityRepository {
  replace(serialized: string): Promise<void>;
  close?: () => Promise<void>;
}

const DATABASE_NAME = 'crossword';
const DATABASE_VERSION = 3;
const PUZZLE_STORE_NAME = 'puzzle-manifests';
const SESSION_STORE_NAME = 'solve-sessions';
const EVENT_STORE_NAME = 'solve-events';
const PREFERENCES_STORE_NAME = 'preferences';
const PROFILE_STORE_NAME = 'profiles';

function memoryRepository(): ContinuityRepository {
  return {
    async replace(serialized) {
      await parseContinuityExport(serialized);
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
    if (!database.objectStoreNames.contains(PUZZLE_STORE_NAME)) database.createObjectStore(PUZZLE_STORE_NAME, { keyPath: 'id' });
    if (!database.objectStoreNames.contains(SESSION_STORE_NAME)) database.createObjectStore(SESSION_STORE_NAME, { keyPath: 'puzzleId' });
    if (!database.objectStoreNames.contains(EVENT_STORE_NAME)) database.createObjectStore(EVENT_STORE_NAME, { keyPath: 'id' });
    if (!database.objectStoreNames.contains(PREFERENCES_STORE_NAME)) database.createObjectStore(PREFERENCES_STORE_NAME, { keyPath: 'id' });
    if (!database.objectStoreNames.contains(PROFILE_STORE_NAME)) database.createObjectStore(PROFILE_STORE_NAME, { keyPath: 'id' });
  };
  return requestResult(request);
}

export function createIndexedDbContinuityRepository(
  databaseName = DATABASE_NAME,
  factory: IDBFactory | undefined = typeof indexedDB === 'undefined' ? undefined : indexedDB
): ContinuityRepository {
  if (!factory) return memoryRepository();
  const database = openDatabase(factory, databaseName);
  return {
    async replace(serialized) {
      const archive = await parseContinuityExport(serialized);
      const connection = await database;
      const transaction = connection.transaction([
        PUZZLE_STORE_NAME,
        SESSION_STORE_NAME,
        EVENT_STORE_NAME,
        PREFERENCES_STORE_NAME,
        PROFILE_STORE_NAME
      ], 'readwrite');
      const complete = transactionComplete(transaction);
      const puzzles = transaction.objectStore(PUZZLE_STORE_NAME);
      const sessions = transaction.objectStore(SESSION_STORE_NAME);
      const events = transaction.objectStore(EVENT_STORE_NAME);
      const preferences = transaction.objectStore(PREFERENCES_STORE_NAME);
      const profiles = transaction.objectStore(PROFILE_STORE_NAME);
      puzzles.clear();
      sessions.clear();
      events.clear();
      preferences.clear();
      profiles.clear();
      for (const puzzle of archive.puzzles) puzzles.put(puzzle);
      for (const session of archive.sessions) sessions.put(session);
      events.put({ id: 'current', events: archive.events });
      preferences.put({ id: 'current', value: archive.preferences });
      profiles.put({ id: 'current', value: archive.profiles });
      await complete;
    },
    async close() {
      (await database).close();
    }
  };
}