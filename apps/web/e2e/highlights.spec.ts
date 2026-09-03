import { expect, test } from '@playwright/test';
import { backgroundColor, gridCell, openSolver } from './helpers';

// Paint-regression guards: the shipped bug class was "state correct, paint
// transparent" (an undefined CSS variable made the active clue row invisible
// in every browser). These assertions read the RENDERED result so that class
// of failure can never pass again.

test.describe('highlight paint', () => {
  test('selected grid cell paints the strong across fill', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openSolver(page);
    await gridCell(page, 'real-cell-0-0').click();

    const bg = await backgroundColor(page, '.grid-cell.is-active');
    expect(bg).not.toBe('rgba(0, 0, 0, 0)');
    expect(bg).not.toBe('transparent');
  });

  test('the active clue row paints an opaque surface and seam accent', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openSolver(page);
    await gridCell(page, 'real-cell-0-0').click();

    const row = page.locator('[data-state="active"]').first();
    const paint = await row.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { background: cs.backgroundColor, borderRight: cs.borderRightWidth };
    });
    expect(paint.background).not.toBe('rgba(0, 0, 0, 0)');
    expect(paint.background).not.toBe('transparent');
    expect(parseFloat(paint.borderRight)).toBeGreaterThanOrEqual(3);
  });

  test('crossing entries tint in their own direction family with ringed cells', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openSolver(page);
    await gridCell(page, 'real-cell-0-0').click();

    const canvas = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const affected = page.locator('[data-state="affected"]').first();
    const bg = await affected.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).not.toBe('rgba(0, 0, 0, 0)');
    expect(bg).not.toBe(canvas);

    const ring = await page
      .locator('[data-crossing="true"]')
      .first()
      .evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(ring).toBe('solid');
  });

  test('the rotated field marks render at legacy scale', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openSolver(page);
    await gridCell(page, 'real-cell-0-0').click();

    const mark = await page
      .locator('.clue-spine-left')
      .evaluate((el) => {
        const cs = getComputedStyle(el, '::before');
        return { content: cs.content, fontSize: parseFloat(cs.fontSize), opacity: parseFloat(cs.opacity) };
      });
    expect(mark.content).toContain('Across');
    expect(mark.fontSize).toBeGreaterThanOrEqual(150);
    expect(mark.opacity).toBeGreaterThan(0.05);
  });
});
