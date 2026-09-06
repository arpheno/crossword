import { expect, test } from '@playwright/test';

import { gridCell, openSolver } from './helpers';

test.describe('solver workflow contract', () => {
  test('Check and Clear incorrect preserve the evaluation context', async ({ page }) => {
    await openSolver(page);
    const firstCell = gridCell(page, 'real-cell-0-0');
    const secondCell = gridCell(page, 'real-cell-0-1');
    const emptyCell = gridCell(page, 'real-cell-0-2');

    await firstCell.click();
    await page.keyboard.type('XY');
    await page.getByRole('button', { name: 'Check' }).click();

    await expect(firstCell).toHaveClass(/red/);
    await expect(secondCell).toHaveClass(/red/);
    await expect(emptyCell).not.toHaveClass(/green/);
    await expect(page.getByRole('button', { name: 'Hide check' })).toBeVisible();
    await expect(page.locator('.stat-item').filter({ hasText: 'Checks' }).locator('.stat-value')).toHaveText('1');
    await expect(page.locator('.stat-item').filter({ hasText: 'Score' }).locator('.stat-value')).toHaveText('90');

    await firstCell.click();
    await page.keyboard.type('A');
    await expect(firstCell).not.toHaveClass(/red/);
    await expect(secondCell).toHaveClass(/red/);

    await page.getByRole('button', { name: 'Clear incorrect' }).click();
    await expect(secondCell).toHaveValue('');
    await expect(secondCell).not.toHaveClass(/green/);
    await expect(emptyCell).not.toHaveClass(/green/);

    await page.getByRole('button', { name: 'Hide check' }).click();
    await expect(page.getByRole('button', { name: 'Check' })).toBeVisible();
    await expect(page.locator('.stat-item').filter({ hasText: 'Checks' }).locator('.stat-value')).toHaveText('1');
    await expect(page.locator('.stat-item').filter({ hasText: 'Score' }).locator('.stat-value')).toHaveText('90');
  });

  test('reload preserves check results and assistance accounting', async ({ page }) => {
    await openSolver(page);
    const firstCell = gridCell(page, 'real-cell-0-0');
    await firstCell.click();
    await page.keyboard.type('X');
    await page.getByRole('button', { name: 'Check' }).click();
    await expect(firstCell).toHaveClass(/red/);
    await page.waitForTimeout(350);

    await page.reload();
    await page.waitForSelector('#crossword-container input');
    await expect(gridCell(page, 'real-cell-0-0')).toHaveClass(/red/);
    await expect(page.getByRole('button', { name: 'Hide check' })).toBeVisible();
    await expect(page.locator('.stat-item').filter({ hasText: 'Checks' }).locator('.stat-value')).toHaveText('1');
    await expect(page.locator('.stat-item').filter({ hasText: 'Score' }).locator('.stat-value')).toHaveText('90');
  });

  test('checking a mistake paints it and editing clears the stale error', async ({ page }) => {
    await openSolver(page);
    const firstCell = gridCell(page, 'real-cell-0-0');

    await firstCell.click();
    await page.keyboard.type('X');
    await page.getByRole('button', { name: 'Check' }).click();
    await expect(firstCell).toHaveClass(/red/);

    await firstCell.click();
    await page.keyboard.type('A');
    await expect(firstCell).toHaveValue('A');
    await expect(firstCell).not.toHaveClass(/red/);
  });

  test('pause blocks input until the session is resumed', async ({ page }) => {
    await openSolver(page);
    const firstCell = gridCell(page, 'real-cell-0-0');

    await firstCell.click();
    await page.getByRole('button', { name: 'Pause' }).click();
    await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible();

    await firstCell.click();
    await page.keyboard.type('A');
    await expect(firstCell).toHaveValue('');

    await page.getByRole('button', { name: 'Resume' }).click();
    await firstCell.click();
    await page.keyboard.type('A');
    await expect(firstCell).toHaveValue('A');
  });

  test('reveal requires confirmation and records assistance', async ({ page }) => {
    await openSolver(page);
    const firstCell = gridCell(page, 'real-cell-0-0');
    page.once('dialog', (dialog) => dialog.accept());

    await page.getByRole('button', { name: 'Reveal' }).click();
    await expect(firstCell).toHaveValue('A');
    const playableCells = await page.locator('#crossword-container input').count();
    await expect(page.locator('.stat-item').filter({ hasText: 'Reveals' }).locator('.stat-value')).toHaveText(String(playableCells));
  });

  test('initial solving stays local and does not call provider routes', async ({ page }) => {
    const providerRequests: string[] = [];
    page.on('request', (request) => {
      if (/\/(?:crossword_by_date|random_crossword)(?:\?|\/|$)/.test(new URL(request.url()).pathname)) {
        providerRequests.push(request.url());
      }
    });

    await openSolver(page);
    expect(providerRequests).toEqual([]);
  });
});