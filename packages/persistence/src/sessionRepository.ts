import { validateSessionSnapshot, type SolveSessionSnapshot } from '@crossword/domain';
import { openCrosswordDatabase, STORE_NAMES, type DatabaseHandle } from './database';

export interface SessionRepository {
  load(puzzleId: string): Promise<SolveSessionSnapshot | undefined>;
  save(snapshot: SolveSessionSnapshot): Promise<void>;
  remove(puzzleId: string): Promise<void>;
  close?: () => Promise<void>;
}

/**
 * Typed result of a revision-serialized session write (ADR 0005 §2).
 * `stale-write`: an older asynchronous completion lost to a newer revision.
 * `conflict`: another connection holds a newer authoritative revision.
 */
export type SessionWriteResult = Readonly<
  | { ok: true; written: true }
  | { ok: false; code: 'stale-write' | 'conflict' | 'invalid'; message?: string }
>;

export interface RevisionedSessionRepository extends SessionRepository {
  trySave(snapshot: SolveSessionSnapshot): Promise<SessionWriteResult>;
}

const DATABASE_NAME = 'crossword';

function memoryRepository(): RevisionedSessionRepository {
  const snapshots = new Map<string, SolveSessionSnapshot>();
  const committed = new Map<string, number>();
  return {
    load: async (puzzleId) => snapshots.get(puzzleId),
    save: async (snapshot) => {
      if (!validateSessionSnapshot(snapshot)) throw new Error('Cannot persist an invalid solve session');
      snapshots.set(snapshot.puzzleId, snapshot);
    },
    async trySave(snapshot) {
      if (!validateSessionSnapshot(snapshot)) return { ok: false, code: 'invalid', message: 'Cannot persist an invalid solve session' };
      const committedRevision = committed.get(snapshot.puzzleId);
      if (committedRevision !== undefined && snapshot.revision < committedRevision) return { ok: false, code: 'stale-write' };
      snapshots.set(snapshot.puzzleId, snapshot);
      committed.set(snapshot.puzzleId, snapshot.revision);
      return { ok: true, written: true };
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

function migrateSnapshot(value: unknown): SolveSessionSnapshot | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const candidate = value as Partial<SolveSessionSnapshot>;
  if (typeof candidate.puzzleId !== 'string' || typeof candidate.startedAtMs !== 'number') return undefined;
  const hasEvaluationState = candidate.checkPresentation !== undefined;
  return {
    ...candidate,
    revision: candidate.revision ?? candidate.events?.length ?? 0,
    checkedCellIds: hasEvaluationState ? candidate.checkedCellIds ?? [] : [],
    revealedCellIds: candidate.revealedCellIds ?? [],
    checkPresentation: candidate.checkPresentation ?? { mode: 'off', scope: 'puzzle', evaluations: {} },
    assistanceReceipts: candidate.assistanceReceipts ?? [],
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
): RevisionedSessionRepository {
  if (!factory) return memoryRepository();

  let handlePromise: Promise<DatabaseHandle> | undefined;
  const openHandle = () => {
    handlePromise ??= openCrosswordDatabase(factory, databaseName);
    return handlePromise;
  };

  // Serialized per-puzzle write chain (ADR 0005 §2): writes apply in call
  // order and each one is checked against the newest committed revision.
  const writeChains = new Map<string, Promise<unknown>>();
  const committed = new Map<string, number>();

  const serializeWrite = <T>(puzzleId: string, operation: () => Promise<T>): Promise<T> => {
    const previous = writeChains.get(puzzleId) ?? Promise.resolve();
    const next = previous.then(operation, operation);
    writeChains.set(puzzleId, next.catch(() => undefined));
    return next;
  };

  const commitRevision = async (snapshot: SolveSessionSnapshot): Promise<boolean> => {
    const handle = await openHandle();
    const transaction = handle.connection.transaction(STORE_NAMES.sessions, 'readwrite');
    const store = transaction.objectStore(STORE_NAMES.sessions);
    const complete = transactionComplete(transaction);
    // Re-check inside the transaction so another connection cannot slip a
    // newer revision between the check and the put.
    const stored = await requestResult<SolveSessionSnapshot | undefined>(store.get(snapshot.puzzleId));
    if (stored && stored.revision > snapshot.revision) {
      transaction.abort();
      await complete.catch(() => undefined);
      return false;
    }
    store.put(snapshot);
    await complete;
    return true;
  };

  const repository = {
    async load(puzzleId: string) {
      const handle = await openHandle();
      const transaction = handle.connection.transaction(STORE_NAMES.sessions, 'readonly');
      const complete = transactionComplete(transaction);
      const result = await requestResult<SolveSessionSnapshot | undefined>(transaction.objectStore(STORE_NAMES.sessions).get(puzzleId));
      await complete;
      const migrated = migrateSnapshot(result);
      return migrated && validateSessionSnapshot(migrated) ? migrated : undefined;
    },
    async save(snapshot: SolveSessionSnapshot) {
      if (!validateSessionSnapshot(snapshot)) throw new Error('Cannot persist an invalid solve session');
      const handle = await openHandle();
      const transaction = handle.connection.transaction(STORE_NAMES.sessions, 'readwrite');
      transaction.objectStore(STORE_NAMES.sessions).put(snapshot);
      await transactionComplete(transaction);
    },
    async trySave(snapshot: SolveSessionSnapshot): Promise<SessionWriteResult> {
      if (!validateSessionSnapshot(snapshot)) return { ok: false, code: 'invalid', message: 'Cannot persist an invalid solve session' };
      return serializeWrite(snapshot.puzzleId, async () => {
        const committedRevision = committed.get(snapshot.puzzleId);
        if (committedRevision !== undefined && snapshot.revision < committedRevision) return { ok: false, code: 'stale-write' };
        const stored = await repository.load(snapshot.puzzleId);
        if (stored && stored.revision > snapshot.revision) return { ok: false, code: 'conflict' };
        const written = await commitRevision(snapshot);
        if (!written) return { ok: false, code: 'conflict' };
        committed.set(snapshot.puzzleId, snapshot.revision);
        return { ok: true, written: true };
      });
    },
    async remove(puzzleId: string) {
      const handle = await openHandle();
      const transaction = handle.connection.transaction(STORE_NAMES.sessions, 'readwrite');
      transaction.objectStore(STORE_NAMES.sessions).delete(puzzleId);
      await transactionComplete(transaction);
    },
    async close() {
      if (!handlePromise) return;
      (await handlePromise).close();
    }
  };
  return repository;
}
