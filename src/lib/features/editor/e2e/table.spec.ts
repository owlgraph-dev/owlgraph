// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { test, expect } from '$tests/e2e/fixtures';
import { endOfLine } from '$tests/e2e/editor';
import { authState, seed } from '$tests/e2e/seed-data';
import { createPage } from '$tests/e2e/api';
import { doc, para, txt } from '$tests/e2e/doc';
import type { Locator, Page } from '@playwright/test';

const cell = (content: string | unknown[], isHeader = false) => ({
  type: 'tableCell',
  attrs: { isHeader },
  content: typeof content === 'string' ? [txt(content)] : content,
});
const row = (cells: unknown[], isHeader = false) => ({ type: 'tableRow', attrs: { isHeader }, content: cells });
const table = () => ({
  type: 'table',
  attrs: { blockId: 'tbl' },
  content: [
    row([cell('Name', true), cell('Kind', true), cell('Notes', true)], true),
    row([cell('a1'), cell('b1'), cell([txt('see '), txt('Public', [{ type: 'pageLink', attrs: { targetPageId: seed.publicId, targetSlug: seed.publicSlug } }])])]),
    row([cell('a2'), cell('b2'), cell([txt('active', [{ type: 'semanticProperty', attrs: { propName: 'core:status' } }])])]),
  ],
});

const cellAt = (t: Locator, r: number, c: number) => t.locator('tr').nth(r).locator('th, td').nth(c);
const width = async (l: Locator) => (await l.boundingBox())!.width;
const height = async (l: Locator) => (await l.boundingBox())!.height;

// Column and row handles cross, so a handle is grabbed at `at`, a fraction
// along its long side, away from where the other kind crosses it.
async function drag(page: Page, handle: Locator, dx: number, dy: number, at: number) {
  const box = (await handle.boundingBox())!;
  const vertical = box.height > box.width;
  const x = vertical ? box.x + box.width / 2 : box.x + box.width * at;
  const y = vertical ? box.y + box.height * at : box.y + box.height / 2;
  // Nothing may lie over the grab point — the selected block's toolbar floats over a table's top edge.
  expect(await handle.evaluate((h, p) => document.elementFromPoint(p.x, p.y) === h, { x, y }), 'the handle is under the pointer').toBe(true);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 4 });
  await page.mouse.move(x + dx, y + dy, { steps: 4 });
  await page.mouse.up();
}

test.describe('a table in the editor', () => {
  test.use({ storageState: authState('admin'), viewport: { width: 1280, height: 900 } });

  test('cells edit with their marks, the keyboard moves between them, the tools reshape the table, drags resize it, the page shows it', async ({ page }) => {
    const { slug } = await createPage(page.request, { doc: doc(para('intro'), table(), para('outro')) });
    await page.goto(`/${slug}/edit`);
    const t = page.locator('.ProseMirror [data-block-id="tbl"]');
    await expect(t.locator('table.table-block-table')).toBeVisible();
    await expect(t.locator('col')).toHaveCount(3);
    await expect(t.locator('th')).toHaveCount(3);

    // The drags come first: ProseMirror folds edits within half a second of
    // each other into one undo step, so nothing may precede them.
    await t.hover();
    const bodyRow = t.locator('tr').nth(1);
    const rowBefore = await height(bodyRow);
    await drag(page, t.locator('.table-block-row-divider').nth(1), 0, 40, 0.1);
    await expect.poll(() => height(bodyRow)).toBeGreaterThan(rowBefore + 25);
    await page.keyboard.press('Control+z');
    await expect.poll(() => height(bodyRow)).toBeLessThan(rowBefore + 3);

    await t.hover();
    const first = cellAt(t, 0, 0);
    const before = await width(first);
    await drag(page, t.locator('.table-block-divider').first(), 80, 0, 0.15);
    await expect.poll(() => width(first)).toBeGreaterThan(before + 40);
    await page.keyboard.press('Control+z');
    await expect.poll(() => width(first)).toBeLessThan(before + 3);
    await page.keyboard.press('Control+Shift+z');
    await expect.poll(() => width(first)).toBeGreaterThan(before + 40);

    // The table's keymap reads the editor's selection, which follows a click
    // only once the browser reports it: each such key comes after typing.
    await cellAt(t, 1, 0).click();
    await endOfLine(page, page.locator('.ProseMirror'));
    await page.keyboard.type('x');
    await expect(cellAt(t, 1, 0)).toHaveText('a1x');
    await page.keyboard.press('Tab');
    await page.keyboard.type('y');
    await expect(cellAt(t, 1, 1)).toHaveText('yb1');
    await page.keyboard.press('Enter');
    await page.keyboard.type('z');
    await expect(cellAt(t, 2, 1)).toHaveText('zb2');
    await expect(cellAt(t, 1, 1)).toHaveText('yb1');
    await expect(t.locator('tr')).toHaveCount(3);

    const linkCell = cellAt(t, 1, 2);
    await expect(linkCell.locator(`a[data-page-id="${seed.publicId}"]`)).toHaveText('Public');
    await expect(cellAt(t, 2, 2).locator('span[data-prop="core:status"]')).toHaveText('active');
    await cellAt(t, 2, 0).click();
    await endOfLine(page, page.locator('.ProseMirror'));
    await page.keyboard.type(' and more');
    await expect(cellAt(t, 2, 0)).toHaveText('a2 and more');
    await expect(linkCell.locator('a[data-page-id]')).toHaveCount(1);

    await cellAt(t, 1, 0).click();
    await page.getByRole('navigation', { name: 'Block ancestry' }).getByRole('button', { name: 'Table', exact: true }).click();
    await page.getByRole('button', { name: 'Add column', exact: true }).click();
    await expect(t.locator('col')).toHaveCount(4);
    await expect(t.locator('th')).toHaveCount(4);
    // After a drag, a new column still takes an even share: the narrowest
    // column decides the table's minimum width.
    expect(await width(cellAt(t, 0, 3))).toBeGreaterThan((await width(t.locator('table'))) * 0.18);
    expect(await t.evaluate((el) => el.scrollWidth <= el.clientWidth + 1), 'the table fits its column').toBe(true);
    await page.getByRole('button', { name: 'Add row', exact: true }).click();
    await expect(t.locator('tr')).toHaveCount(4);
    await page.getByRole('button', { name: 'Remove row', exact: true }).click();
    await expect(t.locator('tr')).toHaveCount(3);
    await page.getByRole('button', { name: 'Toggle header row', exact: true }).click();
    await expect(t).toHaveClass(/table-block--header-hidden/);
    await page.getByRole('button', { name: 'Toggle header row', exact: true }).click();
    await expect(t).not.toHaveClass(/table-block--header-hidden/);

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Saved')).toBeVisible({ timeout: 15000 });

    await page.goto(`/${slug}`);
    const pt = page.locator('.canvas-blocks [data-block-id="tbl"]');
    await expect(pt.locator('col')).toHaveCount(4);
    await expect(pt.locator('th')).toHaveCount(4);
    await expect(cellAt(pt, 1, 0)).toHaveText('a1x');
    await expect(cellAt(pt, 2, 0)).toHaveText('a2 and more');
    await expect(cellAt(pt, 2, 1)).toHaveText('zb2');
    await expect(cellAt(pt, 1, 2).locator('a.page-link')).toHaveAttribute('href', new RegExp(`${seed.publicSlug}$`));
    await expect(cellAt(pt, 2, 2).locator('span.sem-prop[data-prop="core:status"]')).toHaveText('active');
    expect(await width(cellAt(pt, 0, 0))).toBeGreaterThan((await width(cellAt(pt, 0, 1))) + 20);
    expect(await pt.evaluate((el) => el.scrollWidth <= el.clientWidth + 1), 'the table fits its column on the page').toBe(true);
    expect(await pt.locator('[style]').count(), 'no style attribute on the page').toBe(0);
  });

  test('a table stored with a sliver column draws it at the floor: visible, reachable, and as wide as a drag to the minimum makes it', async ({ page }) => {
    // A weight of 1 beside percent-like weights.
    const sliver = { ...table(), attrs: { blockId: 'tbl', columnWidths: [42, 25, 33, 1] } };
    sliver.content = sliver.content.map((r) => ({ ...r, content: [...r.content, cell('d', r.attrs.isHeader)] }));
    const { slug } = await createPage(page.request, { doc: doc(para('intro'), sliver, para('outro')) });
    // The minimum width follows the narrowest column (table.css): at the
    // floor, 20 readable columns, as for a column dragged to the minimum.
    const minWidthInColumns = (block: Locator) => block.evaluate((el) => parseFloat(getComputedStyle(el.querySelector('table')!).getPropertyValue('--table-span')));

    await page.goto(`/${slug}`);
    const pt = page.locator('.canvas-blocks [data-block-id="tbl"]');
    expect(await minWidthInColumns(pt)).toBeLessThan(22);
    expect(await width(cellAt(pt, 0, 3))).toBeGreaterThan((await width(pt.locator('table'))) * 0.04);

    await page.goto(`/${slug}/edit`);
    const t = page.locator('.ProseMirror [data-block-id="tbl"]');
    await expect(t.locator('col')).toHaveCount(4);
    expect(await minWidthInColumns(t)).toBeLessThan(22);
    // Measured as a share: the pixel width alone says little.
    const share = async () => (await width(cellAt(t, 0, 3))) / (await width(t.locator('table')));
    const before = await share();
    const divider = t.locator('.table-block-divider').nth(2);
    await divider.scrollIntoViewIfNeeded();
    await t.hover();
    await drag(page, divider, -80, 0, 0.6);
    await expect.poll(share).toBeGreaterThan(before * 1.5);
    await expect.poll(() => minWidthInColumns(t)).toBeLessThan(20);
  });

  test('a column drag stops where the column would become unreadable: the table keeps fitting its column', async ({ page }) => {
    const { slug } = await createPage(page.request, { doc: doc(para('intro'), table(), para('outro')) });
    await page.goto(`/${slug}/edit`);
    const t = page.locator('.ProseMirror [data-block-id="tbl"]');
    await expect(t.locator('col')).toHaveCount(3);
    const readable = await t.locator('table').evaluate((el) => parseFloat(getComputedStyle(el).getPropertyValue('--table-col-min')) * parseFloat(getComputedStyle(document.documentElement).fontSize));
    await t.hover();
    await drag(page, t.locator('.table-block-divider').first(), -600, 0, 0.15);
    const first = cellAt(t, 0, 0);
    await expect.poll(() => width(first)).toBeLessThan(readable * 1.2);
    expect(await width(first)).toBeGreaterThanOrEqual(readable - 1);
    expect(await t.evaluate((el) => el.scrollWidth <= el.clientWidth + 1), 'the table fits its column').toBe(true);
  });
});
