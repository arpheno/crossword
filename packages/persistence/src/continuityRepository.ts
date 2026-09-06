import {
  createContinuityExport,
  parseContinuityExport,
  validateArchiveGraph,
  type ContinuityArchive,
  type ContinuityMergeReport
} from './archive';
import { neutralLearnerProfile, parseLearnerProfile, type LearnerProfileV1 } from '@crossword/domain';

/** Working view of the stored continuity graph (no integrity seal). */
type ContinuitySnapshot = Omit<ContinuityArchive, 'integrity'>;
import { openCrosswordDatabase, STORE_NAMES, type DatabaseHandle } from './database';

export interface ContinuityRepository {
  replace(serialized: string): Promise<void>;
  close?: () => Promise<void>;
}

export interface RevisionedContinuityRepository extends ContinuityRepository {
  /** Additive merge; existing records win id collisions (ADR 0005 SS5). */
  merge(serialized: string): Promise<ContinuityMergeReport>;
  /** Imports one named puzzle with its session; clears nothing. */
  importOne(serialized: string, puzzleId: string): Promise<{ ok: true; importedSession: boolean } | { ok: false; code: 'puzzle-not-found' }>;
  /** Serializes the full current continuity state (backup includes every store). */
  exportAll(): Promise<string>;
  loadSession(puzzleId: string): Promise<unknown>;
  loadSolvedDays(): Promise<readonly string[]>;
  /** Typed, strictly validated learner profile accessors (ADR 0008). */
  loadLearnerProfile(): Promise<LearnerProfileV1 | undefined>;
  saveLearnerProfile(profile: LearnerProfileV1): Promise<void>;
  resetLearnerProfile(nowIso: string): Promise<LearnerProfileV1>;
}

const DATABASE_NAME = 'crossword';

/** Pure merge accounting shared by the repository and preview surfaces (ADR 0005 SS5). */
export function computeMergeReport(existing: ContinuitySnapshot, incoming: ContinuitySnapshot): ContinuityMergeReport {
  const existingPuzzleIds = new Set(existing.puzzles.map((puzzle) => puzzle.id));
  const existingSessionRevisions = new Map(existing.sessions.map((session) => [session.puzzleId, session.revision]));
  const existingEventIds = new Set(existing.events.map((event) => event.id));
  const report = { puzzlesAdded: 0, puzzlesKeptExisting: 0, sessionsAdded: 0, sessionsUpdated: 0, sessionsKeptExisting: 0, eventsAdded: 0 };
  for (const puzzle of incoming.puzzles) {
    if (existingPuzzleIds.has(puzzle.id)) report.puzzlesKeptExisting += 1;
    else report.puzzlesAdded += 1;
  }
  for (const session of incoming.sessions) {
    const current = existingSessionRevisions.get(session.puzzleId);
    if (current === undefined) report.sessionsAdded += 1;
    else if (session.revision > current) report.sessionsUpdated += 1;
    else report.sessionsKeptExisting += 1;
  }
  for (const event of incoming.events) {
    if (!existingEventIds.has(event.id)) report.eventsAdded += 1;
  }
  return report;
}

function memoryRepository(): RevisionedContinuityRepository {
  let state: { archive: ContinuityArchive } | undefined;
  return {
    async replace(serialized) {
      state = { archive: await parseContinuityExport(serialized) };
    },
    async merge(serialized) {
      const incoming = await parseContinuityExport(serialized);
      const existing = state?.archive;
      if (!existing) {
        state = { archive: incoming };
        return { puzzlesAdded: incoming.puzzles.length, puzzlesKeptExisting: 0, sessionsAdded: incoming.sessions.length, sessionsUpdated: 0, sessionsKeptExisting: 0, eventsAdded: incoming.events.length };
      }
      return computeMergeReport(existing, incoming);
    },
    async importOne(serialized, puzzleId) {
      const archive = await parseContinuityExport(serialized);
      if (!archive.puzzles.some((puzzle) => puzzle.id === puzzleId)) return { ok: false, code: 'puzzle-not-found' };
      state = { archive };
      return { ok: true, importedSession: archive.sessions.some((session) => session.puzzleId === puzzleId) };
    },
    async exportAll() {
      return JSON.stringify(state?.archive ?? {});
    },
    loadSession: async (puzzleId) => state?.archive.sessions.find((session) => session.puzzleId === puzzleId),
    loadSolvedDays: async () => state?.archive.solvedDays ?? [],
    loadLearnerProfile: async () => {
      const record = (state?.archive.profiles as Record<string, unknown> | undefined)?.['learner-profile'];
      return record !== undefined ? parseLearnerProfile(record) : undefined;
    },
    async saveLearnerProfile(profile) {
      const validated = parseLearnerProfile(profile);
      if (!validated) throw new Error('Cannot persist an invalid learner profile');
      const current = state?.archive;
      if (current) {
        state = { archive: { ...current, profiles: { ...(current.profiles as Record<string, unknown>), 'learner-profile': validated } as unknown as ContinuityArchive['profiles'] } };
      }
    },
    async resetLearnerProfile(nowIso) {
      const next = neutralLearnerProfile((await this.loadLearnerProfile())?.id ?? 'household', nowIso);
      await this.saveLearnerProfile(next);
      return next;
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

const CONTINUITY_STORES: readonly string[] = [
  STORE_NAMES.puzzles,
  STORE_NAMES.sessions,
  STORE_NAMES.events,
  STORE_NAMES.preferences,
  STORE_NAMES.profiles
];

export function createIndexedDbContinuityRepository(
  databaseName = DATABASE_NAME,
  factory: IDBFactory | undefined = typeof indexedDB === 'undefined' ? undefined : indexedDB
): RevisionedContinuityRepository {
  if (!factory) return memoryRepository();

  let handlePromise: Promise<DatabaseHandle> | undefined;
  const openHandle = () => {
    handlePromise ??= openCrosswordDatabase(factory, databaseName);
    return handlePromise;
  };

  const writeArchive = async (archive: ContinuityArchive, mode: 'replace' | 'merge'): Promise<void> => {
    const [graphIssue] = validateArchiveGraph(archive);
    if (graphIssue) throw new Error('Continuity archive graph is invalid: ' + graphIssue.path + ' ' + graphIssue.code);
    const handle = await openHandle();
    const transaction = handle.connection.transaction(CONTINUITY_STORES, 'readwrite');
    const complete = transactionComplete(transaction);
    const puzzles = transaction.objectStore(STORE_NAMES.puzzles);
    const sessions = transaction.objectStore(STORE_NAMES.sessions);
    const events = transaction.objectStore(STORE_NAMES.events);
    const preferences = transaction.objectStore(STORE_NAMES.preferences);
    const profiles = transaction.objectStore(STORE_NAMES.profiles);
    if (mode === 'replace') {
      puzzles.clear();
      sessions.clear();
      events.clear();
      preferences.clear();
      profiles.clear();
      for (const puzzle of archive.puzzles) puzzles.put(puzzle);
      for (const session of archive.sessions) sessions.put(session);
      events.put({ id: 'current', events: archive.events });
      preferences.put({ id: 'current', value: archive.preferences });
      // Split the archive's profile collection back into its records; the
      // learner profile is restored through the strict parser (ADR 0008).
      const profileRecord = archive.profiles as Record<string, unknown>;
      const learnerProfile = profileRecord['learner-profile'];
      if (learnerProfile !== undefined) {
        const validated = parseLearnerProfile(learnerProfile);
        if (validated) profiles.put({ id: 'learner-profile', value: validated });
      }
      profiles.put({ id: 'current', value: archive.profiles });
      preferences.put({ id: 'solved-days', value: archive.solvedDays ?? [] });
      await complete;
      return;
    }
    // Merge (ADR 0005 SS5): additive; existing records win id collisions;
    // sessions follow newest-revision-wins; preferences and profiles are
    // never touched by a merge.
    for (const puzzle of archive.puzzles) {
      const stored = await requestResult<unknown>(puzzles.get(puzzle.id));
      if (!stored) puzzles.put(puzzle);
    }
    for (const session of archive.sessions) {
      const stored = await requestResult<{ revision: number } | undefined>(sessions.get(session.puzzleId));
      if (!stored) sessions.put(session);
      else if (session.revision > stored.revision) sessions.put(session);
    }
    if (archive.events.length > 0) {
      const current = await requestResult<{ id: string; events: readonly unknown[] } | undefined>(events.get('current'));
      const known = new Set((current?.events as readonly { id: string }[] | undefined)?.map((event) => event.id) ?? []);
      const additions = archive.events.filter((event) => !known.has(event.id));
      if (additions.length > 0) events.put({ id: 'current', events: [...(current?.events ?? []), ...additions] });
    }
    await complete;
  };

  const readCurrent = async (): Promise<ContinuitySnapshot> => {
    const handle = await openHandle();
    const read = handle.connection.transaction(CONTINUITY_STORES, 'readonly');
    const puzzles = await requestResult<unknown[]>(read.objectStore(STORE_NAMES.puzzles).getAll());
    const sessions = await requestResult<unknown[]>(read.objectStore(STORE_NAMES.sessions).getAll());
    const events = await requestResult<{ id: string; events: readonly unknown[] } | undefined>(read.objectStore(STORE_NAMES.events).get('current'));
    const preferences = await requestResult<{ id: string; value: unknown } | undefined>(read.objectStore(STORE_NAMES.preferences).get('current'));
    const profiles = await requestResult<{ id: string; value: unknown } | undefined>(read.objectStore(STORE_NAMES.profiles).get('current'));
    // ADR 0008: the export covers EVERY profile store, including the typed
    // learner profile, so a backup is complete and reset is checkable.
    const learnerProfile = await requestResult<{ id: string; value: unknown } | undefined>(read.objectStore(STORE_NAMES.profiles).get('learner-profile'));
    const solvedDays = await requestResult<{ id: string; value: readonly string[] } | undefined>(read.objectStore(STORE_NAMES.preferences).get('solved-days'));
    await transactionComplete(read);
    const profileCollection = {
      ...((profiles?.value ?? {}) as Record<string, unknown>),
      ...(learnerProfile ? { 'learner-profile': learnerProfile.value } : {})
    };
    return {
      kind: 'crossword-continuity',
      schemaVersion: 1,
      exportedAt: '',
      preferences: (preferences?.value ?? {}) as ContinuityArchive['preferences'],
      profiles: profileCollection as ContinuityArchive['profiles'],
      puzzles: puzzles as ContinuityArchive['puzzles'],
      sessions: sessions as ContinuityArchive['sessions'],
      events: (events?.events as ContinuityArchive['events']) ?? [],
      solvedDays: solvedDays?.value ?? []
    };
  };

  return {
    async replace(serialized) {
      const archive = await parseContinuityExport(serialized);
      await writeArchive(archive, 'replace');
    },
    async merge(serialized) {
      const incoming = await parseContinuityExport(serialized);
      const existing = await readCurrent();
      const report = computeMergeReport(existing, incoming);
      await writeArchive(incoming, 'merge');
      return report;
    },
    async importOne(serialized, puzzleId) {
      const archive = await parseContinuityExport(serialized);
      const target = archive.puzzles.find((puzzle) => puzzle.id === puzzleId);
      if (!target) return { ok: false, code: 'puzzle-not-found' };
      const session = archive.sessions.find((entry) => entry.puzzleId === puzzleId);
      const handle = await openHandle();
      const transaction = handle.connection.transaction([STORE_NAMES.puzzles, STORE_NAMES.sessions], 'readwrite');
      const complete = transactionComplete(transaction);
      transaction.objectStore(STORE_NAMES.puzzles).put(target);
      if (session) transaction.objectStore(STORE_NAMES.sessions).put(session);
      await complete;
      return { ok: true, importedSession: Boolean(session) };
    },
    async exportAll() {
      const current = await readCurrent();
      return createContinuityExport({
        preferences: current.preferences,
        profiles: current.profiles,
        puzzles: current.puzzles,
        sessions: current.sessions,
        events: current.events,
        solvedDays: current.solvedDays ?? []
      });
    },
    async loadSession(puzzleId) {
      const handle = await openHandle();
      const transaction = handle.connection.transaction(STORE_NAMES.sessions, 'readonly');
      const complete = transactionComplete(transaction);
      const session = await requestResult<unknown>(transaction.objectStore(STORE_NAMES.sessions).get(puzzleId));
      await complete;
      return session;
    },
    async loadSolvedDays() {
      const handle = await openHandle();
      const transaction = handle.connection.transaction(STORE_NAMES.preferences, 'readonly');
      const complete = transactionComplete(transaction);
      const record = await requestResult<{ id: string; value: readonly string[] } | undefined>(transaction.objectStore(STORE_NAMES.preferences).get('solved-days'));
      await complete;
      return record?.value ?? [];
    },
    async loadLearnerProfile() {
      const handle = await openHandle();
      const transaction = handle.connection.transaction(STORE_NAMES.profiles, 'readonly');
      const complete = transactionComplete(transaction);
      const record = await requestResult<{ id: string; value: unknown } | undefined>(transaction.objectStore(STORE_NAMES.profiles).get('learner-profile'));
      await complete;
      return record ? parseLearnerProfile(record.value) : undefined;
    },
    async saveLearnerProfile(profile) {
      // Strict validation at the boundary: a drifted shape never reaches storage.
      const validated = parseLearnerProfile(profile);
      if (!validated) throw new Error('Cannot persist an invalid learner profile');
      const handle = await openHandle();
      const transaction = handle.connection.transaction(STORE_NAMES.profiles, 'readwrite');
      transaction.objectStore(STORE_NAMES.profiles).put({ id: 'learner-profile', value: validated });
      await transactionComplete(transaction);
    },
    async resetLearnerProfile(nowIso) {
      const existing = await this.loadLearnerProfile();
      const next = neutralLearnerProfile(existing?.id ?? 'household', nowIso);
      await this.saveLearnerProfile(next);
      return next;
    },
    async close() {
      if (!handlePromise) return;
      (await handlePromise).close();
    }
  };
}