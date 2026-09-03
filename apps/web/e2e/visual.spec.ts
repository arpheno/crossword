import { expect, test } from '@playwright/test';
import { openSolver } from './helpers';

// Visual baselines for the owner to eyeball (and CI to guard, once wired).
// The clock is masked: it is the one deliberately dynamic surface.

async function shot(page: import('@playwright/test').Page, name: string, maskClock = true) {
  await expect(page).toHaveScreenshot(name, {
    animations: 'disabled',
    fullPage: false,
    mask: maskClock ? [page.locator('.solve-clock'), page.locator('.data-notice')] : []
  });
}

test.describe('visual baselines', () => {
  test('panorama 1440 with a typed entry', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openSolver(page);
    await page.locator('.crossword-grid [data-cell-id="real-cell-0-0"]').click();
    await page.keyboard.type('ABAB', { delay: 30 });
    await page.waitForTimeout(200);
    await shot(page, 'panorama-1440.png');
  });

  test('standard 1136 stacked mode', async ({ page }) => {
    await page.setViewportSize({ width: 1136, height: 900 });
    await openSolver(page);
    await page.locator('.crossword-grid [data-cell-id="real-cell-0-0"]').click();
    await page.waitForTimeout(200);
    await shot(page, 'standard-1136.png');
  });

  test('night mode', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openSolver(page);
    await page.locator('.theme-toggle').click();
    await page.waitForTimeout(200);
    await shot(page, 'panorama-1440-night.png');
  });

  test('harness half-collapsed fixture', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/harness?fixture=half-collapsed');
    await page.waitForSelector('.crossword-grid');
    await page.waitForTimeout(250);
    await shot(page, 'harness-half-collapsed.png');
  });
});
