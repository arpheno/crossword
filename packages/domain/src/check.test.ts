import { describe, expect, it } from 'vitest';
import {
  checkSession,
  checksUsed,
  clearCell,
  clearEnteredCells,
  clearIncorrect,
  createFixturePuzzle,
  createSession,
  entrySolveState,
  enterLetter,
  hideCheck,
  indexPuzzle,
  revealCell,
  revealsUsed,
  scoreForSession,
  selectCell
} from './index';
import type { CellId } from './index';

const puzzle = createFixturePuzzle();
const index = indexPuzzle(puzzle);

describe('checkSession three-way contract', () => {
  it('marks only non-empty cells checked; empty cells stay neutral', () => {
    let session = selectCell(createSession(puzzle, index), index, 'cell-0-0' as CellId, 'across');
    session = enterLetter(session, puzzle, index, 'X');
    // cell-0-1 left empty, then check the whole entry
    session = selectCell(session, index, 'cell-0-0' as CellId, 'across');
    const result = checkSession(session, puzzle, index, 'entry');

    expect(result.incorrectCellIds).toContain('cell-0-0' as CellId); // wrong letter
    expect(result.checkedCellIds).toContain('cell-0-0' as CellId);
    expect(result.checkedCellIds).not.toContain('cell-0-1' as CellId); // empty stays neutral
  });

  it('drops stale marks when a checked cell is emptied later', () => {
    let session = selectCell(createSession(puzzle, index), index, 'cell-0-0' as CellId, 'across');
    for (const letter of 'CARE') session = enterLetter(session, puzzle, index, letter);
    session = checkSession(session, puzzle, index, 'entry').snapshot;
    expect(session.checkedCellIds.length).toBeGreaterThan(0);

    // empty the first cell (backspace on it) then re-check
    session = selectCell(session, index, 'cell-0-0' as CellId, 'across');
    session = clearCell(session, puzzle, index);
    session = checkSession(session, puzzle, index, 'entry').snapshot;
    expect(session.checkedCellIds).not.toContain('cell-0-0' as CellId);
  });

  it('clearEnteredCells empties exactly the requested cells', () => {
    let session = selectCell(createSession(puzzle, index), index, 'cell-0-0' as CellId, 'across');
    for (const letter of 'CARE') session = enterLetter(session, puzzle, index, letter);
    session = clearEnteredCells(session, puzzle, index, ['cell-0-0' as CellId, 'cell-0-1' as CellId]);
    expect(session.entered['cell-0-0' as CellId]).toBe('');
    expect(session.entered['cell-0-1' as CellId]).toBe('');
    expect(session.entered['cell-0-2' as CellId]).toBe('R');
  });

  it('keeps explicit evaluation states and clears only current errors', () => {
    let session = selectCell(createSession(puzzle, index), index, 'cell-0-0' as CellId, 'across');
    session = enterLetter(session, puzzle, index, 'X');
    session = enterLetter(session, puzzle, index, 'Y');
    const checked = checkSession(session, puzzle, index, 'entry').snapshot;

    expect(checked.checkPresentation.mode).toBe('on');
    expect(checked.checkPresentation.evaluations['cell-0-0']?.state).toBe('incorrect');
    expect(checked.checkPresentation.evaluations['cell-0-1']?.state).toBe('incorrect');
    expect(checked.checkPresentation.evaluations['cell-0-2']?.state).toBe('empty');
    expect(checksUsed(checked)).toBe(1);
    expect(scoreForSession(checked)).toBe(90);

    const cleared = clearIncorrect(checked, puzzle, index);
    expect(cleared.checkPresentation.mode).toBe('on');
    expect(cleared.entered['cell-0-0' as CellId]).toBe('');
    expect(cleared.entered['cell-0-1' as CellId]).toBe('');
    expect(cleared.checkPresentation.evaluations['cell-0-0']?.state).toBe('unevaluated');
    expect(cleared.checkPresentation.evaluations['cell-0-1']?.state).toBe('unevaluated');
    expect(cleared.checkPresentation.evaluations['cell-0-2']?.state).toBe('empty');
    expect(scoreForSession(cleared)).toBe(90);
  });

  it('hides feedback without creating a receipt and distinguishes filled from verified', () => {
    let session = selectCell(createSession(puzzle, index), index, 'cell-0-0' as CellId, 'across');
    for (const letter of 'CARE') session = enterLetter(session, puzzle, index, letter);
    expect(entrySolveState(puzzle.entries[0]!, session)).toBe('filled-unverified');

    const checked = checkSession(session, puzzle, index, 'entry').snapshot;
    expect(entrySolveState(puzzle.entries[0]!, checked)).toBe('verified');
    const hidden = hideCheck(checked);
    expect(hidden.checkPresentation.mode).toBe('off');
    expect(hidden.assistanceReceipts).toHaveLength(1);
    expect(hideCheck(hidden)).toEqual(hidden);
  });

  it('records cell reveal penalties once and reports revealed cells', () => {
    const session = createSession(puzzle, index);
    const revealed = revealCell(session, puzzle, index, 'cell');
    expect(revealed.revealedCellIds).toEqual(['cell-0-0']);
    expect(revealsUsed(revealed)).toBe(1);
    expect(scoreForSession(revealed)).toBe(80);
    expect(revealCell(revealed, puzzle, index, 'cell')).toEqual(revealed);
  });
});
