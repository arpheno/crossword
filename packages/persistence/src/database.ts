/**
 * Single owner of the crossword IndexedDB schema (ADR 0005 §1): name, version,
 * object stores, migrations, and connection lifecycle. Repositories must open
 * through this module so upgrades are never duplicated and never blocked by a
 * forgotten connection.
 */
export const DATABASE_VERSION = 3;

export const STORE_NAMES = Object.freeze({
  puzzles: 'puzzle-manifests',
  sessions: 'solve-sessions',
  events: 'solve-events',
  preferences: 'preferences',
  profiles: 'profiles'
});

export type ContinuityStoreName = (typeof STORE_NAMES)[keyof typeof STORE_NAMES];

const ALL_STORES: readonly ContinuityStoreName[] = [
  STORE_NAMES.puzzles,
  STORE_NAMES.sessions,
  STORE_NAMES.events,
  STORE_NAMES.preferences,
  STORE_NAMES.profiles
];

export type DatabaseHandle = Readonly<{
  connection: IDBDatabase;
  /** Invoked at most once when the connection is closed (including versionchange). */
  onClose: (listener: () => void) => void;
  close: () => void;
}>;

export type OpenCrosswordDatabaseOptions = Readonly<{
  /** Called when an upgrade request is blocked by another open connection. */
  onBlocked?: () => void;
  /** Open at a higher version than the current schema (upgrade tests). */
  version?: number;
}>;

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

/**
 * Upgrade path for every supported prior version. v1 databases contain only
 * the legacy solve-session store; later versions add the remaining continuity
 * stores. Existing records are never rewritten by an upgrade.
 */
function upgrade(database: IDBDatabase): void {
  if (!database.objectStoreNames.contains(STORE_NAMES.sessions)) {
    database.createObjectStore(STORE_NAMES.sessions, { keyPath: 'puzzleId' });
  }
  if (!database.objectStoreNames.contains(STORE_NAMES.puzzles)) {
    database.createObjectStore(STORE_NAMES.puzzles, { keyPath: 'id' });
  }
  if (!database.objectStoreNames.contains(STORE_NAMES.events)) database.createObjectStore(STORE_NAMES.events, { keyPath: 'id' });
  if (!database.objectStoreNames.contains(STORE_NAMES.preferences)) database.createObjectStore(STORE_NAMES.preferences, { keyPath: 'id' });
  if (!database.objectStoreNames.contains(STORE_NAMES.profiles)) database.createObjectStore(STORE_NAMES.profiles, { keyPath: 'id' });
}

export async function openCrosswordDatabase(
  factory: IDBFactory,
  databaseName: string,
  options: OpenCrosswordDatabaseOptions = {}
): Promise<DatabaseHandle> {
  const request = factory.open(databaseName, options.version ?? DATABASE_VERSION);
  request.onupgradeneeded = () => upgrade(request.result);
  if (options.onBlocked) request.onblocked = () => options.onBlocked?.();
  const connection = await requestResult(request);

  const closeListeners = new Set<() => void>();
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    connection.onversionchange = null;
    connection.close();
    for (const listener of closeListeners) listener();
    closeListeners.clear();
  };
  // Release the connection promptly so another opener's upgrade is never
  // blocked by this process (ADR 0005 §1).
  connection.onversionchange = () => close();
  return {
    connection,
    onClose: (listener) => {
      if (closed) listener();
      else closeListeners.add(listener);
    },
    close
  };
}
