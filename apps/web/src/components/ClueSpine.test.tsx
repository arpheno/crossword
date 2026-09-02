// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import {
  createFixturePuzzle,
  createSession,
  enterLetter,
  indexPuzzle,
  selectCell,
  toggleDirection,
  type CellId,
  type SolveSessionSnapshot
} from '@crossword/domain';
import { ClueSpine } from './ClueSpine';
import type { CompletionPolicy } from '../cluePlacement';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const puzzle = createFixturePuzzle();
const index = indexPuzzle(puzzle);
const acrossEntries = puzzle.entries.filter((entry) => entry.direction === 'across');
const downEntries = puzzle.entries.filter((entry) => entry.direction === 'down');

function mount(
  session: SolveSessionSnapshot,
  direction: 'across' | 'down',
  policy?: CompletionPolicy,
  onSelectPattern = vi.fn()
) {
  const rootElement = document.createElement('div');
  document.body.append(rootElement);
  const root = createRoot(rootElement);
  const entries = direction === 'across' ? acrossEntries : downEntries;
  const render = (current: SolveSessionSnapshot) => {
    act(() => {
      root.render(
        <ClueSpine
          completionPolicy={policy}
          direction={direction}
          entries={entries}
          incorrectCellIds={[]}
          index={index}
          onSelectEntry={vi.fn()}
          onSelectPattern={onSelectPattern}
          session={current}
          side={direction === 'across' ? 'left' : 'right'}
        />
      );
    });
  };
  render(session);
  return { render, root, rootElement, onSelectPattern };
}

function placementSnapshot(rootElement: HTMLElement): Map<string, string> {
  const map = new Map<string, string>();
  rootElement.querySelectorAll<HTMLElement>('[data-entry-id]').forEach((row) => {
    map.set(
      row.getAttribute('data-entry-id') ?? '',
      `${row.getAttribute('data-lane')}:${row.getAttribute('data-row')}`
    );
  });
  return map;
}

describe('ClueSpine', () => {
  it('marks every crossing entry and its exact shared cells', () => {
    let session = createSession(puzzle, index);
    session = selectCell(session, index, 'cell-0-0' as CellId, 'across');
    const { root, rootElement } = mount(session, 'down');

    // every down entry crosses across entry 0 in this fixture
    expect(rootElement.querySelectorAll('[data-state="affected"]')).toHaveLength(4);
    expect(rootElement.querySelectorAll('[data-state="active"]')).toHaveLength(0);
    const crossings = rootElement.querySelectorAll('.pattern-position.is-crossing');
    expect(crossings).toHaveLength(4);
    crossings.forEach((cell) => {
      expect(cell.getAttribute('data-cell-id')?.startsWith('cell-0-')).toBe(true);
    });

    act(() => root.unmount());
    rootElement.remove();
  });

  it('swaps affected rows on direction toggle without moving the selected cell', () => {
    let session = createSession(puzzle, index);
    session = selectCell(session, index, 'cell-0-0' as CellId, 'across');
    session = toggleDirection(session, index);
    expect(session.selection.cellId).toBe('cell-0-0' as CellId);

    const { root, rootElement } = mount(session, 'across');
    expect(rootElement.querySelectorAll('[data-state="affected"]')).toHaveLength(4);
    expect(rootElement.querySelectorAll('[data-state="active"]')).toHaveLength(0);

    act(() => root.unmount());
    rootElement.remove();
  });

  it('keeps lane and row stable when a clue is solved', () => {
    let session = createSession(puzzle, index);
    const idle = mount(session, 'across', 'visible');
    const before = placementSnapshot(idle.rootElement);
    expect(before.size).toBe(4);

    session = selectCell(session, index, 'cell-0-0' as CellId, 'across');
    for (const letter of 'CARE') session = enterLetter(session, puzzle, index, letter);

    const render = (current: SolveSessionSnapshot) => {
      act(() => {
        idle.root.render(
          <ClueSpine
            completionPolicy="visible"
            direction="across"
            entries={acrossEntries}
            incorrectCellIds={[]}
            index={index}
            onSelectEntry={vi.fn()}
            onSelectPattern={vi.fn()}
            session={current}
            side="left"
          />
        );
      });
    };
    render(session);

    const after = placementSnapshot(idle.rootElement);
    expect(after.get('entry-across-0')).toBe(before.get('entry-across-0'));
    expect(after.get('entry-across-1')).toBe(before.get('entry-across-1'));
    expect(after.get('entry-across-2')).toBe(before.get('entry-across-2'));
    expect(after.get('entry-across-3')).toBe(before.get('entry-across-3'));
    expect(idle.rootElement.querySelector('[data-entry-id="entry-across-0"]')?.getAttribute('data-state')).toBe('solved');

    act(() => idle.root.unmount());
    idle.rootElement.remove();
  });

  it('applies the completion policies: collapsed shrinks, hidden removes and reflows', () => {
    let session = createSession(puzzle, index);
    session = selectCell(session, index, 'cell-0-0' as CellId, 'across');
    for (const letter of 'CARE') session = enterLetter(session, puzzle, index, letter);

    const collapsed = mount(session, 'across');
    const solvedRow = collapsed.rootElement.querySelector('[data-entry-id="entry-across-0"]');
    expect(solvedRow?.getAttribute('data-collapsed')).toBe('true');
    expect(solvedRow?.getAttribute('data-state')).toBe('solved');
    act(() => collapsed.root.unmount());
    collapsed.rootElement.remove();

    const hidden = mount(session, 'across', 'hidden');
    expect(hidden.rootElement.querySelector('[data-entry-id="entry-across-0"]')).toBeNull();
    expect(hidden.rootElement.querySelectorAll('[data-entry-id]')).toHaveLength(3);
    expect(hidden.rootElement.querySelector('.spine-layout')?.getAttribute('style')).toContain('repeat(2');
    act(() => hidden.root.unmount());
    hidden.rootElement.remove();
  });

  it('selects the exact grid cell from a pattern position', () => {
    const session = createSession(puzzle, index);
    const { root, rootElement, onSelectPattern } = mount(session, 'across', 'collapsed');
    const row = rootElement.querySelector('[data-entry-id="entry-across-1"]');
    const secondPattern = row?.querySelectorAll<HTMLElement>('.pattern-position')[1];
    expect(secondPattern?.getAttribute('data-cell-id')).toBe('cell-1-1');
    act(() => {
      secondPattern?.click();
    });
    expect(onSelectPattern).toHaveBeenCalledWith(acrossEntries[1], 1);
    act(() => root.unmount());
    rootElement.remove();
  });
});
