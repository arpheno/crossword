import 'fake-indexeddb/auto';
import { createFixturePuzzle, createSession, indexPuzzle } from '@crossword/domain';
import { describe, expect, it } from 'vitest';
import { createIndexedDbSessionRepository, type SessionWriteResult } from './sessionRepository';

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void; reject: (error: unknown) => void };
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function snapshotAt(puzzle: ReturnType<typeof createFixturePuzzle>, revision: number) {
  const base = createSession(puzzle, indexPuzzle(puzzle), 123);
  return { ...base, revision };
}

describe('session write ordering (ADR 0005 §2)', () => {
  it('commits increasing revisions and reports what happened', async () => {
    const puzzle = createFixturePuzzle();
    const repository = createIndexedDbSessionRepository(`write-order-${Date.now()}`);

    const first = await repository.trySave!(snapshotAt(puzzle, 1));
    const second = await repository.trySave!(snapshotAt(puzzle, 2));

    expect(first).toEqual({ ok: true, written: true });
    expect(second).toEqual({ ok: true, written: true });
    expect((await repository.load(puzzle.id))?.revision).toBe(2);
    await repository.close?.();
  });

  it('never lets an older asynchronous write beat a newer committed revision', async () => {
    const puzzle = createFixturePuzzle();
    const repository = createIndexedDbSessionRepository(`write-stale-${Date.now()}`);
    const gate = deferred<void>();
    const slow = snapshotAt(puzzle, 5);
    const stale = snapshotAt(puzzle, 3);

    // Start the newer write but hold its transaction completion back via a
    // serialized queue; the older write is issued while the newer is pending.
    const pendingNewer = repository.trySave!(slow);
    const pendingStale = repository.trySave!(stale);
    gate.resolve(undefined);
    const [newer, older] = await Promise.all([pendingNewer, pendingStale]);

    expect(newer).toEqual({ ok: true, written: true });
    expect(older).toEqual({ ok: false, code: 'stale-write' });
    expect((await repository.load(puzzle.id))?.revision).toBe(5);
    await repository.close?.();
  });

  it('detects a conflicting older writer from another connection', async () => {
    const puzzle = createFixturePuzzle();
    const name = `write-conflict-${Date.now()}`;
    const authoritative = createIndexedDbSessionRepository(name);
    await authoritative.trySave!(snapshotAt(puzzle, 7));
    await authoritative.close?.();

    const staleTab = createIndexedDbSessionRepository(name);
    const result = await staleTab.trySave!(snapshotAt(puzzle, 4));

    expect(result).toEqual({ ok: false, code: 'conflict' });
    expect((await staleTab.load(puzzle.id))?.revision).toBe(7);
    await staleTab.close?.();
  });

  it('treats an equal-revision re-save as an idempotent rewrite', async () => {
    const puzzle = createFixturePuzzle();
    const repository = createIndexedDbSessionRepository(`write-equal-${Date.now()}`);
    const same = snapshotAt(puzzle, 3);

    await repository.trySave!(same);
    const again = await repository.trySave!(same);

    expect(again).toEqual({ ok: true, written: true });
    await repository.close?.();
  });

  it('keeps the legacy save contract for existing callers', async () => {
    const puzzle = createFixturePuzzle();
    const repository = createIndexedDbSessionRepository(`write-legacy-${Date.now()}`);
    await repository.save(snapshotAt(puzzle, 1));
    expect((await repository.load(puzzle.id))?.revision).toBe(1);
    await repository.close?.();
  });
});
