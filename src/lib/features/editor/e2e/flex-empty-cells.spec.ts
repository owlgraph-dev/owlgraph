// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { test, expect } from '$tests/e2e/fixtures';
import { endOfLine } from '$tests/e2e/editor';
import { authState } from '$tests/e2e/seed-data';
import { createPage } from '$tests/e2e/api';
import { doc, para } from '$tests/e2e/doc';
import { horizontalOverflow } from '$tests/e2e/responsive';
import type { Page } from '@playwright/test';

// The hover grip sits in a block's top-right corner, and moves onto the top
// edge of a block too narrow to share it.

const emptyRow = (id: string, n: number) => ({ type: 'flexContainer', attrs: { blockId: id }, content: Array.from({ length: n }, () => ({ type: 'flexCell', content: [] })) });
const mixed = { type: 'flexContainer', attrs: { blockId: 'mixed', layout: { desktop: { gap: 16 } } }, content: [{ type: 'flexCell', content: [para('Go')] }, { type: 'flexCell', content: [] }] };

const box = (page: Page, selector: string) => page.locator(selector).first().evaluate((el) => {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width };
});

test.describe('empty flex cells and short blocks in the editor', () => {
  test.use({ storageState: authState('admin'), viewport: { width: 1280, height: 900 } });

  test("an empty cell shows its hint and takes a click, its '+' too, under the hover grip", async ({ page }) => {
    const { slug } = await createPage(page.request, { doc: doc(para('intro'), emptyRow('fresh', 2), para('outro')) });
    await page.goto(`/${slug}/edit`);
    const cell = page.locator('.ProseMirror [data-block-id="fresh"] .flex-cell').first();
    const content = cell.locator('.ph-content');
    await expect(content).toHaveAttribute('data-empty', '');
    expect(await content.evaluate((el) => getComputedStyle(el, '::before').content)).toBe('"Type, or choose a block"');
    // A flex cell is sized by its content: as wide as the hint, not the 2.75rem floor.
    expect((await box(page, '.ProseMirror [data-block-id="fresh"] .flex-cell')).width).toBeGreaterThan(150);

    await cell.locator('.ph-row').hover();
    await expect(page.locator('.block-tools .bt-drag')).toBeVisible();
    await cell.getByRole('button', { name: 'Insert block', exact: true }).click();
    await expect(page.getByRole('menu', { name: 'Insert a block' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu', { name: 'Insert a block' })).toHaveCount(0);

    const c = await box(page, '.ProseMirror [data-block-id="fresh"] .flex-cell .ph-content');
    await page.mouse.click(c.left + 20, (c.top + c.bottom) / 2);
    await expect.poll(() => page.evaluate(() => !!getSelection()?.anchorNode?.parentElement?.closest('.ph-content, .ph-row'))).toBe(true);
    await page.keyboard.type('Hello');
    await expect(cell.locator('p')).toHaveText('Hello');
    await expect(cell.locator('.ph-row')).toHaveCount(0);
  });

  test('a short word keeps its grip on its top edge, and a click in it places the caret', async ({ page }) => {
    const { slug } = await createPage(page.request, { doc: doc(para('intro'), mixed, para('outro')) });
    await page.goto(`/${slug}/edit`);
    const word = '.ProseMirror [data-block-id="Go"]';
    const w = await box(page, word);
    await page.mouse.move(w.left + w.width / 2, (w.top + w.bottom) / 2);
    // The hover tools are the ones with the grip (the selected block has its own toolbar).
    const grip = page.locator('.block-tools:has(.bt-drag)');
    await expect(grip).toBeVisible();
    const g = await box(page, '.block-tools:has(.bt-drag)');
    expect(g.bottom, 'the grip sits on the block, outside it').toBeLessThanOrEqual(w.top + 1);
    expect(g.right).toBeCloseTo(w.right, 0);

    await page.mouse.click(w.left + w.width / 2, (w.top + w.bottom) / 2);
    await expect.poll(() => page.evaluate(() => getSelection()?.anchorNode?.textContent)).toBe('Go');
    await endOfLine(page, page.locator('.ProseMirror'));
    await page.keyboard.type('!');
    await expect(page.locator(word)).toHaveText('Go!');
    await expect(page.locator('.ProseMirror [data-block-id="mixed"] .flex-cell').first().locator('[data-block-id="Go"]')).toHaveCount(1);
  });

  test('a row of empty cells shrinks them rather than pushing the canvas sideways', async ({ page }) => {
    const { slug } = await createPage(page.request, { doc: doc(para('intro'), emptyRow('five', 5), para('outro')) });
    await page.goto(`/${slug}/edit`);
    const fits = () => page.locator('.ProseMirror [data-block-id="five"] > .flex').evaluate((row) => {
      const r = row.getBoundingClientRect();
      return [...row.children].every((c) => c.getBoundingClientRect().right <= r.right + 1);
    });
    await expect(page.locator('.ProseMirror [data-block-id="five"] .ph-row')).toHaveCount(5);
    expect(await fits()).toBe(true);
    expect(await horizontalOverflow(page)).toEqual([]);
    await page.getByRole('radio', { name: 'Phone preview' }).click();
    await expect.poll(fits).toBe(true);
    expect(await horizontalOverflow(page)).toEqual([]);
  });
});
