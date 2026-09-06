import 'fake-indexeddb/auto';
import { createFixturePuzzle, createSession, indexPuzzle } from '@crossword/domain';
import { describe, expect, it, vi } from 'vitest';
import {
  DATABASE_VERSION,
  STORE_NAMES,
  openCrosswordDatabase
} from './database';

function legacyDatabase(name: string, version: number, stores: readonly string[]): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version);
    request.onupgradeneeded = () => {
      for (const store of stores) {
        if (!request.result.objectStoreNames.contains(store)) {
          request.result.createObjectStore(store, { keyPath: store === 'puzzle-manifests' ? 'id' : 'puzzleId' });
        }
      }
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

describe('crossword database owner (ADR 0005 §1)', () => {
  it('creates every continuity store at the current version', async () => {
    const name = `owner-all-stores-${Date.now()}`;
    const handle = await openCrosswordDatabase(indexedDB, name);

    expect(handle.connection.version).toBe(DATABASE_VERSION);
    for (const store of Object.values(STORE_NAMES)) {
      expect(handle.connection.objectStoreNames.contains(store)).toBe(true);
    }
    handle.close();
  });

  it('migrates a v1 legacy database without losing existing sessions', async () => {
    const name = `owner-legacy-${Date.now()}`;
    const puzzle = createFixturePuzzle();
    const snapshot = createSession(puzzle, indexPuzzle(puzzle), 123);
    const legacy = await legacyDatabase(name, 1, ['solve-sessions']);
    await new Promise<void>((resolve, reject) => {
      const tx = legacy.transaction('solve-sessions', 'readwrite');
      tx.objectStore('solve-sessions').put(snapshot);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    legacy.close();

    const handle = await openCrosswordDatabase(indexedDB, name);
    expect(handle.connection.version).toBe(DATABASE_VERSION);
    const stored = await new Promise<unknown>((resolve, reject) => {
      const tx = handle.connection.transaction(STORE_NAMES.sessions, 'readonly');
      const request = tx.objectStore(STORE_NAMES.sessions).get(puzzle.id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    expect(stored).toEqual(snapshot);
    handle.close();
  });

  it('closes its connection on a versionchange request from another opener', async () => {
    const name = `owner-versionchange-${Date.now()}`;
    const handle = await openCrosswordDatabase(indexedDB, name);
    const closed = vi.fn();
    handle.onClose(closed);

    const upgraded = await legacyDatabase(name, DATABASE_VERSION + 1, []);
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(closed).toHaveBeenCalled();
    expect(handle.connection.onversionchange).toBeNull();
    upgraded.close();
  });

  it('reports a blocked upgrade through the blocked callback', async () => {
    // Owner connections release themselves on versionchange, so a blocked
    // upgrade can only come from a foreign raw connection (another agent that
    // opened the database without this owner).
    const name = `owner-blocked-${Date.now()}`;
    const foreign = await legacyDatabase(name, DATABASE_VERSION, [STORE_NAMES.sessions]);
    const blocked = vi.fn();
    const pending = openCrosswordDatabase(indexedDB, name, { onBlocked: blocked, version: DATABASE_VERSION + 1 });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(blocked).toHaveBeenCalled();
    foreign.close();
    await pending.then((next) => next.close());
  });
});