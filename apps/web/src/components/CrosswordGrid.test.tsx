// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import {
  createFixturePuzzle,
  createRealPuzzle,
  createSession,
  indexPuzzle,
  type CellId
} from '@crossword/domain';
import { CrosswordGrid } from './CrosswordGrid';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('CrosswordGrid', () => {
  it('renders the selected cell and routes letter input', () => {
    const puzzle = createFixturePuzzle();
    const index = indexPuzzle(puzzle);
    const session = createSession(puzzle, index);
    const onEnterLetter = vi.fn();
    const rootElement = document.createElement('div');
    document.body.append(rootElement);
    const root = createRoot(rootElement);

    act(() => {
      root.render(
        <CrosswordGrid
          index={index}
          incorrectCellIds={[]}
          onClearCell={vi.fn()}
          onEnterLetter={onEnterLetter}
          onMove={vi.fn()}
          onSelectCell={vi.fn()}
          onStepEntry={vi.fn()}
          onToggleDirection={vi.fn()}
          puzzle={puzzle}
          session={session}
        />
      );
    });

    const selectedCell = rootElement.querySelector<HTMLButtonElement>('[data-cell-id="cell-0-0"]');
    expect(selectedCell?.getAttribute('aria-selected')).toBe('true');

    act(() => {
      selectedCell?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'c' }));
    });

    expect(onEnterLetter).toHaveBeenCalledWith('c');
    act(() => root.unmount());
    rootElement.remove();
  });

  it('keeps each cell target stable for focus movement', () => {
    const puzzle = createFixturePuzzle();
    const index = indexPuzzle(puzzle);
    const session = createSession(puzzle, index);
    const rootElement = document.createElement('div');
    document.body.append(rootElement);
    const root = createRoot(rootElement);

    act(() => {
      root.render(
        <CrosswordGrid
          index={index}
          incorrectCellIds={['cell-0-0' as CellId]}
          onClearCell={vi.fn()}
          onEnterLetter={vi.fn()}
          onMove={vi.fn()}
          onSelectCell={vi.fn()}
          onStepEntry={vi.fn()}
          onToggleDirection={vi.fn()}
          puzzle={puzzle}
          session={session}
        />
      );
    });

    expect(rootElement.querySelectorAll('[role="gridcell"]')).toHaveLength(16);
    expect(rootElement.querySelector('[data-cell-id="cell-0-0"]')?.className).toContain('incorrect');
    act(() => root.unmount());
    rootElement.remove();
  });

  it('renders blocked cells as non-focusable grid cells', () => {
    const puzzle = createRealPuzzle();
    const index = indexPuzzle(puzzle);
    const session = createSession(puzzle, index);
    const rootElement = document.createElement('div');
    document.body.append(rootElement);
    const root = createRoot(rootElement);

    act(() => {
      root.render(
        <CrosswordGrid
          index={index}
          incorrectCellIds={[]}
          onClearCell={vi.fn()}
          onEnterLetter={vi.fn()}
          onMove={vi.fn()}
          onSelectCell={vi.fn()}
          onStepEntry={vi.fn()}
          onToggleDirection={vi.fn()}
          puzzle={puzzle}
          session={session}
        />
      );
    });

    expect(rootElement.querySelectorAll('[data-block="true"]')).toHaveLength(38);
    expect(rootElement.querySelectorAll('[data-block="true"] button')).toHaveLength(0);
    expect(rootElement.querySelector('[data-cell-id="real-cell-0-4"]')?.getAttribute('aria-disabled')).toBe('true');
    act(() => root.unmount());
    rootElement.remove();
  });
});