import { createFixturePuzzle, createSession, indexPuzzle } from '@crossword/domain';
import { describe, expect, it } from 'vitest';
import {
  createContinuityExport,
  parseContinuityExport,
  previewContinuityExport
} from './archive';

describe('continuity archive', () => {
  it('round-trips supported local state with a stable integrity digest', async () => {
    const puzzle = createFixturePuzzle();
    const session = createSession(puzzle, indexPuzzle(puzzle), 123);
    const input = {
      preferences: { theme: 'light', motion: 'subtle' },
      profiles: { player: { noveltyPreference: 0.5 } },
      puzzles: [puzzle],
      sessions: [session]
    } as const;

    const first = await createContinuityExport(input, '2026-08-30T00:00:00.000Z');
    const second = await createContinuityExport(input, '2026-08-30T00:00:00.000Z');
    expect(first).toBe(second);

    const archive = await parseContinuityExport(first);
    expect(archive.puzzles[0]?.id).toBe(puzzle.id);
    expect(await previewContinuityExport(first)).toEqual({
      schemaVersion: 1,
      exportedAt: '2026-08-30T00:00:00.000Z',
      puzzleCount: 1,
      sessionCount: 1,
      eventCount: 0
    });
  });

  it('rejects tampered state before it can be imported', async () => {
    const puzzle = createFixturePuzzle();
    const session = createSession(puzzle, indexPuzzle(puzzle));
    const serialized = await createContinuityExport({
      preferences: {},
      profiles: {},
      puzzles: [puzzle],
      sessions: [session]
    }, '2026-08-30T00:00:00.000Z');
    const tampered = serialized.replace('A Small Beginning', 'A Different Beginning');

    await expect(parseContinuityExport(tampered)).rejects.toThrow('integrity');
  });

  it('rejects malformed session snapshots', async () => {
    const puzzle = createFixturePuzzle();
    const session = createSession(puzzle, indexPuzzle(puzzle));
    const serialized = await createContinuityExport({
      preferences: {},
      profiles: {},
      puzzles: [puzzle],
      sessions: [session]
    }, '2026-08-30T00:00:00.000Z');
    const archive = JSON.parse(serialized) as { sessions: Array<Record<string, unknown>> };
    archive.sessions[0]!.selection = { cellId: 42, direction: 'across', entryId: 'entry-across-0' };

    await expect(parseContinuityExport(JSON.stringify(archive))).rejects.toThrow('schema');
  });
});