import { validateSessionSnapshot, type SolveSessionSnapshot } from '@crossword/domain';

export interface SessionRepository {
  load(puzzleId: string): Promise<SolveSessionSnapshot | undefined>;
  save(snapshot: SolveSessionSnapshot): Promise<void>;
  remove(puzzleId: string): Promise<void>;
  close?: () => Promise<void>;
}

const DATABASE_NAME = 'crossword';
const DATABASE_VERSION = 3;
const STORE_NAME = 'solve-sessions';
const PUZZLE_STORE_NAME = 'puzzle-manifests';
const EVENT_STORE_NAME = 'solve-events';
const PREFERENCES_STORE_NAME = 'preferences';
const PROFILE_STORE_NAME = 'profiles';

function memoryRepository(): SessionRepository {
  const snapshots = new Map<string, SolveSessionSnapshot>();
  return {
    load: async (puzzleId) => snapshots.get(puzzleId),
    save: async (snapshot) => {
      if (!validateSessionSnapshot(snapshot)) throw new Error('Cannot persist an invalid solve session');
      snapshots.set(snapshot.puzzleId, snapshot);
    },
    remove: async (puzzleId) => {
      snapshots.delete(puzzleId);
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
    if (!database.objectStoreNames.contains(STORE_NAME)) {
      database.createObjectStore(STORE_NAME, { keyPath: 'puzzleId' });
    }
    if (!database.objectStoreNames.contains(PUZZLE_STORE_NAME)) {
      database.createObjectStore(PUZZLE_STORE_NAME, { keyPath: 'id' });
    }
    if (!database.objectStoreNames.contains(EVENT_STORE_NAME)) database.createObjectStore(EVENT_STORE_NAME, { keyPath: 'id' });
    if (!database.objectStoreNames.contains(PREFERENCES_STORE_NAME)) database.createObjectStore(PREFERENCES_STORE_NAME, { keyPath: 'id' });
    if (!database.objectStoreNames.contains(PROFILE_STORE_NAME)) database.createObjectStore(PROFILE_STORE_NAME, { keyPath: 'id' });
  };
  return requestResult(request);
}

function migrateSnapshot(value: unknown): SolveSessionSnapshot | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const candidate = value as Partial<SolveSessionSnapshot>;
  if (typeof candidate.puzzleId !== 'string' || typeof candidate.startedAtMs !== 'number') return undefined;
  return {
    ...candidate,
    checkedCellIds: candidate.checkedCellIds ?? [],
    revealedCellIds: candidate.revealedCellIds ?? [],
    clueVariantByEntryId: candidate.clueVariantByEntryId ?? {},
    events: candidate.events ?? [],
    lastClockAtMs: candidate.lastClockAtMs ?? candidate.startedAtMs,
    lastInteractionAtMs: candidate.lastInteractionAtMs ?? candidate.startedAtMs,
    paused: candidate.paused ?? false,
    assistanceCount: candidate.assistanceCount ?? 0,
    status: candidate.status ?? 'in-progress'
  } as SolveSessionSnapshot;
}

export function createIndexedDbSessionRepository(
  databaseName = DATABASE_NAME,
  factory: IDBFactory | undefined = typeof indexedDB === 'undefined' ? undefined : indexedDB
): SessionRepository {
  if (!factory) return memoryRepository();

  const database = openDatabase(factory, databaseName);
  return {
    async load(puzzleId) {
      const connection = await database;
      const transaction = connection.transaction(STORE_NAME, 'readonly');
      const complete = transactionComplete(transaction);
      const result = await requestResult<SolveSessionSnapshot | undefined>(transaction.objectStore(STORE_NAME).get(puzzleId));
      await complete;
      const migrated = migrateSnapshot(result);
      return migrated && validateSessionSnapshot(migrated) ? migrated : undefined;
    },
    async save(snapshot) {
      if (!validateSessionSnapshot(snapshot)) throw new Error('Cannot persist an invalid solve session');
      const connection = await database;
      const transaction = connection.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put(snapshot);
      await transactionComplete(transaction);
    },
    async remove(puzzleId) {
      const connection = await database;
      const transaction = connection.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).delete(puzzleId);
      await transactionComplete(transaction);
    },
    async close() {
      (await database).close();
    }
  };
}
