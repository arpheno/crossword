// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import App from './App';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('legacy replica shell', () => {
  it('renders the legacy composition from domain state', async () => {
    const rootElement = document.createElement('div');
    document.body.append(rootElement);
    const root = createRoot(rootElement);

    await act(async () => {
      root.render(<App />);
    });

    expect(document.querySelectorAll('.clue-column')).toHaveLength(2);
    expect(document.querySelector('#across')).not.toBeNull();
    expect(document.querySelector('#down')).not.toBeNull();
    expect(document.querySelectorAll('#crossword-container .grid-cell').length).toBe(225);
    expect(document.querySelectorAll('#crossword-container input').length).toBe(187);
    expect(document.querySelectorAll('.stat-item').length).toBeGreaterThanOrEqual(5);
    expect(document.querySelector('.theme-switch input')).not.toBeNull();
    expect(document.querySelector('.action-bar')).not.toBeNull();

    await act(async () => {
      root.unmount();
    });
    rootElement.remove();
  });

  it('drives checking, correction, reveal, and pause controls from the grid', async () => {
    const rootElement = document.createElement('div');
    document.body.append(rootElement);
    const root = createRoot(rootElement);
    const originalConfirm = window.confirm;
    window.confirm = () => true;

    await act(async () => {
      root.render(<App />);
    });

    const firstCell = rootElement.querySelector<HTMLInputElement>('#crossword-container input[data-cell-id="real-cell-0-0"]');
    if (!firstCell) throw new Error('First grid cell is missing');

    await act(async () => {
      firstCell.focus();
      firstCell.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'X' }));
    });
    await act(async () => {
      rootElement.querySelector<HTMLButtonElement>('#check-all')?.click();
    });
    expect(firstCell.className).toContain('red');

    await act(async () => {
      firstCell.focus();
      firstCell.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'A' }));
    });
    expect(firstCell.value).toBe('A');
    expect(firstCell.className).not.toContain('red');

    await act(async () => {
      rootElement.querySelector<HTMLButtonElement>('#reveal-all')?.click();
    });
    expect(rootElement.querySelector('.stat-item:nth-child(3) .stat-value')?.textContent).toBe('186');

    await act(async () => {
      rootElement.querySelector<HTMLButtonElement>('.indicator-bar button')?.click();
    });
    expect(rootElement.querySelector('.indicator-bar button')?.textContent).toBe('Resume');

    window.confirm = originalConfirm;
    await act(async () => {
      root.unmount();
    });
    rootElement.remove();
  });

  it('exposes the construct control with honestly-labeled available days', async () => {
    const rootElement = document.createElement('div');
    document.body.append(rootElement);
    const root = createRoot(rootElement);

    await act(async () => {
      root.render(<App />);
    });

    const select = rootElement.querySelector<HTMLSelectElement>('#construct-select');
    expect(select).not.toBeNull();
    // Only days with an available recipe AND measured templates are listed.
    const options = select ? [...select.options].map((option) => option.value) : [];
    expect(options).toContain('monday');
    expect(options).not.toContain('sunday');
    expect(rootElement.querySelector<HTMLButtonElement>('#construct-button')).not.toBeNull();

    await act(async () => {
      root.unmount();
    });
    rootElement.remove();
  });
});
