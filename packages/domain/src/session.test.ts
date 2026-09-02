import { describe, expect, it } from 'vitest';
import {
  checkSession,
  clearCell,
  createFixturePuzzle,
  createSession,
  enterLetter,
  indexPuzzle,
  moveSelection,
  nudgeEntry,
  pauseSession,
  revealCell,
  resumeSession,
  selectCell,
  stepEntry,
  touchSession,
  toggleDirection,
  updateActiveTime
} from './index';
import type { CellId } from './index';

describe('solve session', () => {
  const puzzle = createFixturePuzzle();
  const index = indexPuzzle(puzzle);

  it('keeps selection and direction in one state', () => {
    let session = createSession(puzzle, index);
    session = toggleDirection(session, index);
    expect(session.selection.direction).toBe('down');
    session = moveSelection(session, puzzle, index, 'ArrowDown');
    expect(session.selection.cellId).toBe('cell-1-0');
    expect(session.selection.direction).toBe('down');
  });

  it('enters, clears, and advances through an entry', () => {
    let session = createSession(puzzle, index);
    session = enterLetter(session, puzzle, index, 'c');
    expect(session.entered['cell-0-0']).toBe('C');
    expect(session.selection.cellId).toBe('cell-0-1');
    session = clearCell(session, puzzle, index);
    expect(session.entered['cell-0-1']).toBe('');
    expect(session.selection.cellId).toBe('cell-0-0');
  });

  it('checks only entered mistakes and reveals a requested scope', () => {
    let session = createSession(puzzle, index);
    session = enterLetter(session, puzzle, index, 'x');
    session = selectCell(session, index, 'cell-0-0' as CellId);
    const checked = checkSession(session, puzzle, index, 'cell');
    expect(checked.incorrectCellIds).toEqual(['cell-0-0']);
    session = revealCell(checked.snapshot, puzzle, index, 'entry');
    expect(session.entered['cell-0-0']).toBe('C');
    expect(session.revealedCellIds).toHaveLength(4);
  });

  it('wraps entry stepping and selects the first unresolved cell', () => {
    const session = stepEntry(createSession(puzzle, index), puzzle, index, 'previous');
    expect(session.selection.entryId).toBe('entry-across-3');
    expect(session.selection.cellId).toBe('cell-3-0');
  });

  it('keeps active time monotonic and records session events', () => {
    let session = createSession(puzzle, index, 1_000);
    session = touchSession(session, 2_000);
    session = updateActiveTime(session, 3_000);
    expect(session.activeMs).toBe(2_000);
    expect(session.events.map((event) => event.type)).toEqual(['session-started']);

    session = updateActiveTime(session, 40_000);
    expect(session.activeMs).toBe(2_000);
  });

  it('does not move session timestamps backward', () => {
    let session = createSession(puzzle, index, 1_000);
    session = touchSession(session, 2_000);
    session = touchSession(session, 1_500);

    expect(session.lastClockAtMs).toBe(2_000);
    expect(session.lastInteractionAtMs).toBe(2_000);
  });

  it('pauses and resumes without charging paused time', () => {
    let session = createSession(puzzle, index, 1_000);
    session = touchSession(session, 2_000);
    session = pauseSession(session, 3_000);
    session = resumeSession(session, 20_000);
    session = updateActiveTime(session, 21_000);
    expect(session.activeMs).toBe(3_000);
    expect(session.events.map((event) => event.type)).toEqual([
      'session-started',
      'paused',
      'resumed'
    ]);
  });

  it('records reveal assistance and supports a grounded nudge variant', () => {
    const nudgedPuzzle = {
      ...puzzle,
      clues: puzzle.clues.map((clueSet) =>
        clueSet.entryId === puzzle.entries[0]?.id
          ? {
              ...clueSet,
              variants: [
                ...clueSet.variants,
                { mechanism: 'nudge' as const, text: 'A gentler clue', difficulty: 0.1 }
              ]
            }
          : clueSet
      )
    };
    const nudgedIndex = indexPuzzle(nudgedPuzzle);
    let session = createSession(nudgedPuzzle, nudgedIndex);
    session = nudgeEntry(session, nudgedPuzzle);
    session = revealCell(session, nudgedPuzzle, nudgedIndex, 'cell');
    expect(session.clueVariantByEntryId['entry-across-0']).toBe('nudge');
    expect(session.assistanceCount).toBe(2);
    expect(session.events.map((event) => event.type)).toContain('nudged');
    expect(session.events.map((event) => event.type)).toContain('revealed');
  });

  it('records the action before completion', () => {
    let session = createSession(puzzle, index);
    for (const [row, answer] of ['CARE', 'AREA', 'REAR', 'EARN'].entries()) {
      session = selectCell(session, index, `cell-${row}-0` as CellId, 'across');
      for (const letter of answer) session = enterLetter(session, puzzle, index, letter);
    }

    expect(session.status).toBe('complete');
    const eventTypes = session.events.map((event) => event.type);
    expect(eventTypes.at(-1)).toBe('completed');
    expect(eventTypes.at(-2)).toBe('cell-entered');
  });
});