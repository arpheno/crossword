// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const renders = vi.hoisted(() => ({ grid: 0, spine: 0 }));

vi.mock('./components/CrosswordGrid', async () => {
  const React = await import('react');
  return {
    CrosswordGrid: () => {
      renders.grid += 1;
      return React.createElement('div', { 'data-testid': 'grid-stub' });
    }
  };
});

vi.mock('./components/ClueSpine', async () => {
  const React = await import('react');
  return {
    ClueSpine: () => {
      renders.spine += 1;
      return React.createElement('div', { 'data-testid': 'spine-stub' });
    }
  };
});

vi.mock('@crossword/persistence', async () => {
  return {
    createIndexedDbSessionRepository: () => ({
      load: async () => undefined,
      save: async () => undefined
    }),
    createIndexedDbContinuityRepository: () => ({
      replace: async () => undefined
    }),
    createContinuityExport: async () => '{}',
    parseContinuityExport: async () => ({ sessions: [] })
  };
});

const { default: App } = await import('./App');

function mountApp() {
  const rootElement = document.createElement('div');
  document.body.append(rootElement);
  const root = createRoot(rootElement);
  act(() => {
    root.render(React.createElement(App));
  });
  const unmount = () => {
    act(() => root.unmount());
    rootElement.remove();
  };
  return { root, rootElement, unmount };
}

describe('App composition', () => {
  beforeEach(() => {
    renders.grid = 0;
    renders.spine = 0;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps the grid and spines still while the clock ticks', async () => {
    const { rootElement, unmount } = mountApp();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    const gridBefore = renders.grid;
    const spineBefore = renders.spine;
    const clock = rootElement.querySelector('.solve-clock');
    const before = clock?.textContent ?? '';
    expect(before).toBe('00:00');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(renders.grid).toBe(gridBefore);
    expect(renders.spine).toBe(spineBefore);
    expect(rootElement.querySelector('.solve-clock')?.textContent).toBe('00:03');
    unmount();
  });

  it('composes the utility rail, identity rail, and center stage without dev copy', async () => {
    const { rootElement, unmount } = mountApp();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(rootElement.querySelector('.utility-rail [aria-label="Active solve time"]')).not.toBeNull();
    expect(rootElement.querySelector('[aria-label="Puzzle identity"]')).not.toBeNull();
    expect(rootElement.querySelector('[aria-label="Active clue"]')).not.toBeNull();
    expect(rootElement.querySelector('[aria-label="Solve commands"]')).not.toBeNull();
    expect(rootElement.querySelectorAll('.command-menu').length).toBeGreaterThanOrEqual(3);
    expect(rootElement.textContent).not.toContain('Local workspace / offline ready');
    expect(rootElement.querySelectorAll('.play-header')).toHaveLength(0);
    unmount();
  });
});
