import 'fake-indexeddb/auto';
import { createFixturePuzzle, createSession, indexPuzzle, type PuzzleId } from '@crossword/domain';
import { describe, expect, it } from 'vitest';
import { createContinuityExport, parseContinuityExport } from './archive';
import { createIndexedDbContinuityRepository } from './continuityRepository';
import { createIndexedDbPuzzleRepository } from './puzzleRepository';

function baseArchive() {
  const puzzle = createFixturePuzzle();
  const session = createSession(puzzle, indexPuzzle(puzzle), 123);
  return { puzzle, session };
}

function otherPuzzle() {
  const puzzle = createFixturePuzzle();
  return { ...puzzle, id: 'fixture-puzzle-b' as PuzzleId };
}

describe('archive graph validation (ADR 0005 §4)', () => {
  it('rejects duplicate puzzle ids with a stable path', async () => {
    const { puzzle, session } = baseArchive();
    const archive = await createContinuityExport({
      preferences: {}, profiles: {},
      puzzles: [puzzle, puzzle],
      sessions: [session]
    });
    await expect(parseContinuityExport(archive)).rejects.toThrow(/puzzles\[1\].*duplicate/);
  });

  it('rejects sessions that reference a missing puzzle', async () => {
    const { puzzle, session } = baseArchive();
    const archive = await createContinuityExport({
      preferences: {}, profiles: {},
      puzzles: [puzzle],
      sessions: [{ ...session, puzzleId: 'missing-puzzle' }]
    });
    await expect(parseContinuityExport(archive)).rejects.toThrow(/sessions\[0\].*reference/);
  });

  it('rejects session cells and entries missing from the referenced puzzle', async () => {
    const { puzzle, session } = baseArchive();
    const archive = await createContinuityExport({
      preferences: {}, profiles: {},
      puzzles: [puzzle],
      sessions: [{ ...session, entered: { 'ghost-cell': 'A' } }]
    });
    await expect(parseContinuityExport(archive)).rejects.toThrow(/sessions\[0\].entered/);
  });

  it('rejects duplicate event ids', async () => {
    const { puzzle, session } = baseArchive();
    const archive = await createContinuityExport({
      preferences: {}, profiles: {},
      puzzles: [puzzle],
      sessions: [session],
      events: [
        { id: 'event-1', type: 'session-started', atMs: 1 },
        { id: 'event-1', type: 'session-started', atMs: 2 }
      ]
    });
    await expect(parseContinuityExport(archive)).rejects.toThrow(/events.*duplicate/);
  });

  it('names one invalid record and rejects the whole archive without partial writes', async () => {
    const { puzzle, session } = baseArchive();
    const archive = await createContinuityExport({
      preferences: {}, profiles: {},
      puzzles: [puzzle, otherPuzzle()],
      sessions: [session, { ...session, puzzleId: 'ghost-puzzle' }]
    });
    await expect(parseContinuityExport(archive)).rejects.toThrow(/sessions\[1\]/);
  });
});

describe('continuity operations (ADR 0005 §5)', () => {
  it('merges additively, keeps existing records on id collision, and never touches preferences or profiles', async () => {
    const name = `merge-${Date.now()}`;
    const { puzzle, session } = baseArchive();
    const existing = createIndexedDbContinuityRepository(name);
    const first = await createContinuityExport({
      preferences: { theme: 'dark' },
      profiles: { v: 1 },
      puzzles: [puzzle],
      sessions: [{ ...session, revision: 9 }]
    });
    await existing.replace(first);

    const fresh = otherPuzzle();
    const incomingSession = createSession(fresh, indexPuzzle(fresh), 5);
    const second = await createContinuityExport({
      preferences: { theme: 'light' },
      profiles: { v: 2 },
      puzzles: [fresh, puzzle],
      sessions: [incomingSession, { ...session, revision: 4 }]
    });

    const report = await existing.merge!(second);

    expect(report).toEqual({
      puzzlesAdded: 1, puzzlesKeptExisting: 1,
      sessionsAdded: 1, sessionsUpdated: 0, sessionsKeptExisting: 1,
      eventsAdded: 0
    });
    const puzzles = createIndexedDbPuzzleRepository(name);
    expect((await puzzles.list()).map((p) => p.id).sort()).toEqual(['fixture-puzzle-b', puzzle.id].sort());
    // Preferences and profiles stay under local ownership during merge.
    const preview = await existing.exportAll!();
    const parsed = JSON.parse(preview);
    expect(parsed.preferences).toEqual({ theme: 'dark' });
    expect(parsed.profiles).toEqual({ v: 1 });
    await puzzles.close?.();
    await existing.close?.();
  });

  it('imports exactly one named puzzle with its session without clearing unrelated records', async () => {
    const name = `import-one-${Date.now()}`;
    const { puzzle, session } = baseArchive();
    const repository = createIndexedDbContinuityRepository(name);
    const first = await createContinuityExport({
      preferences: { theme: 'dark' }, profiles: {},
      puzzles: [puzzle], sessions: [session]
    });
    await repository.replace(first);

    const fresh = otherPuzzle();
    const freshSession = createSession(fresh, indexPuzzle(fresh), 7);
    const second = await createContinuityExport({
      preferences: {}, profiles: {},
      puzzles: [fresh, { ...fresh, id: 'fixture-puzzle-c' as PuzzleId }],
      sessions: [freshSession, { ...createSession({ ...fresh, id: 'fixture-puzzle-c' as PuzzleId }, indexPuzzle({ ...fresh, id: 'fixture-puzzle-c' as PuzzleId }), 7) }]
    });

    const result = await repository.importOne!(second, fresh.id);

    expect(result).toEqual({ ok: true, importedSession: true });
    const puzzles = createIndexedDbPuzzleRepository(name);
    const ids = (await puzzles.list()).map((p) => p.id);
    expect(ids).toContain('fixture-puzzle-b');
    expect(ids).not.toContain('fixture-puzzle-c');
    expect(await repository.loadSession!(fresh.id)).toBeDefined();
    await puzzles.close?.();
    await repository.close?.();
  });

  it('fails an import-one for a missing puzzle without touching storage', async () => {
    const name = `import-missing-${Date.now()}`;
    const { puzzle, session } = baseArchive();
    const repository = createIndexedDbContinuityRepository(name);
    const archive = await createContinuityExport({
      preferences: {}, profiles: {}, puzzles: [puzzle], sessions: [session]
    });
    await repository.replace(archive);

    const result = await repository.importOne!(archive, 'not-in-archive');

    expect(result).toEqual({ ok: false, code: 'puzzle-not-found' });
    const puzzles = createIndexedDbPuzzleRepository(name);
    expect((await puzzles.list()).map((p) => p.id)).toEqual([puzzle.id]);
    await puzzles.close?.();
    await repository.close?.();
  });

  it('round-trips solved-day metadata through export, replace, and merge previews', async () => {
    const name = `solved-days-${Date.now()}`;
    const { puzzle, session } = baseArchive();
    const archive = await createContinuityExport({
      preferences: {}, profiles: {},
      puzzles: [puzzle], sessions: [session],
      solvedDays: ['2026-09-01', '2026-09-02']
    });
    const parsed = await parseContinuityExport(archive);
    expect(parsed.solvedDays).toEqual(['2026-09-01', '2026-09-02']);

    const repository = createIndexedDbContinuityRepository(name);
    await repository.replace(archive);
    expect(await repository.loadSolvedDays!()).toEqual(['2026-09-01', '2026-09-02']);
    await repository.close?.();

    const malformed = JSON.parse(archive);
    malformed.solvedDays = ['not-a-date', 42];
    await expect(parseContinuityExport(JSON.stringify(malformed))).rejects.toThrow(/solvedDays/);
  });
});