import { expect, test } from '@playwright/test';
import { backgroundColor, gridCell, openSolver } from './helpers';

// The household play loop: click a cell, type, letters land; arrows move;
// the game is playable at real window sizes — not just at the panorama.

test.describe('play journeys', () => {
  test('typing lands letters in the grid at the owner window size', async ({ page }) => {
    await page.setViewportSize({ width: 1136, height: 900 });
    await openSolver(page);

    await gridCell(page, 'real-cell-0-0').click();
    await page.keyboard.type('ABAB', { delay: 40 });

    const letters = await page.evaluate(() => {
      const row = [...document.querySelectorAll('.crossword-grid .grid-row')][0];
      return [...row.querySelectorAll('.grid-cell')]
        .slice(0, 4)
        .map((cell) => cell.querySelector('.cell-letter')?.textContent ?? '');
    });
    expect(letters).toEqual(['A', 'B', 'A', 'B']);
  });

  test('arrow keys move the selection within the grid', async ({ page }) => {
    await page.setViewportSize({ width: 1136, height: 900 });
    await openSolver(page);

    await gridCell(page, 'real-cell-0-0').click();
    await page.keyboard.press('ArrowRight');
    await expect(gridCell(page, 'real-cell-0-1')).toBeFocused();

    await page.keyboard.press('ArrowDown');
    await expect(gridCell(page, 'real-cell-1-1')).toBeFocused();
  });

  test('clicking a clue-spine answer cell focuses the grid cell, not the spine', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openSolver(page);

    // spine answer cells share data-cell-id with grid cells; focus must land
    // in the grid or keystrokes are dead
    await page.locator('.clue-spine-left [data-cell-id="real-cell-0-0"]').first().click();
    await page.waitForTimeout(250);
    await page.keyboard.type('A');

    // the letter lands in the grid and selection advances within the entry —
    // proof that focus left the spine and lives in the grid
    await expect(gridCell(page, 'real-cell-0-0').locator('.cell-letter')).toHaveText('A');
    await expect(gridCell(page, 'real-cell-0-1')).toBeFocused();
  });

  test('grid cell numbers never repeat the same figure (no 17/17)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openSolver(page);

    const duplicates = await page.evaluate(() =>
      [...document.querySelectorAll('.cell-number')].filter((el) => {
        const match = /^(\d+)\/\1$/.exec(el.textContent?.trim() ?? '');
        return match !== null;
      }).length
    );
    expect(duplicates).toBe(0);
  });

  test('day/night toggle paints basalt at night and persists across reload', async ({ page }) => {
    await page.setViewportSize({ width: 1136, height: 900 });
    await openSolver(page);

    await page.locator('.theme-toggle').click();
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(17, 17, 17)');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'night');

    await page.reload();
    await page.waitForSelector('.crossword-grid');
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(17, 17, 17)');

    // back to day
    await page.locator('.theme-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'day');
  });
});
