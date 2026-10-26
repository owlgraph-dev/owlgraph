// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import type { Page } from '@playwright/test';
import { test, expect } from '$tests/e2e/fixtures';
import { authState, seed } from '$tests/e2e/seed-data';
import { createPage } from '$tests/e2e/api';
import { txt, doc, para, cell } from '$tests/e2e/doc';
import { blockSettings } from '$tests/e2e/editor';

const note = (id: string) => ({ type: 'callout', attrs: { blockId: id, variant: 'info' }, content: [txt(id)] });
// The seeded asset is no real picture: a fixed box height gives the image a
// size to measure.
const image = (id: string, attrs: Record<string, unknown> = {}) => ({
  type: 'image',
  attrs: { blockId: id, assetId: seed.publicAssetId, alt: id, width: 50, boxMode: 'height', boxHeight: 80, ...attrs },
});
const section = (id: string, ...cells: unknown[]) => ({ type: 'pageSection', attrs: { blockId: id, width: 'wide' }, content: cells });
const ARTIKEL = { mode: 'columns', template: { desktop: [3, 2], tablet: [3, 2], phone: [1] }, preset: 'main-aside' };
const columnsPage = (...sections: unknown[]) => ({ type: 'doc', attrs: { layout: ARTIKEL }, content: sections });

/** Where a block is: its section's index on the page, its cell's in the section, its own in the cell. */
const placeOf = (page: Page, id: string) =>
  page.locator(`[data-block-id="${id}"]`).first().evaluate((el) => {
    const cell = el.parentElement!.closest('.grid-cell')!;
    const grid = cell.parentElement!;
    const blocks = [...cell.children].filter((c) => !c.classList.contains('ph-row'));
    return {
      section: [...document.querySelectorAll('.page-section')].indexOf(grid),
      cell: [...grid.children].filter((c) => c.classList.contains('grid-cell')).indexOf(cell),
      index: blocks.indexOf(el),
    };
  });

const top = (page: Page, id: string) => page.locator(`[data-block-id="${id}"]`).first().evaluate((el) => Math.round(el.getBoundingClientRect().top));

async function expectReadingOrder(page: Page, ids: string[], label: string) {
  const tops: number[] = [];
  for (const id of ids) tops.push(await top(page, id));
  for (let i = 1; i < tops.length; i++) expect(tops[i], `${label}: ${ids.join(' < ')} = ${tops.join(' < ')}`).toBeGreaterThan(tops[i - 1]);
}

async function save(page: Page) {
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Saved')).toBeVisible({ timeout: 15000 });
}

test.describe('placement', () => {
  test.use({ storageState: authState('admin'), viewport: { width: 1280, height: 900 } });

  test('an image moves to the aside, into the next section and into a section of its own — each one undoable step', async ({ page }) => {
    const { slug } = await createPage(page.request, { doc: columnsPage(section('s1', cell(para('p1'), image('img')), cell(note('n1'))), section('s2', cell(para('p2')), cell(note('n2'))), section('s3', cell(para('p3')), cell(note('n3')))) });
    await page.goto(`/${slug}/edit`);
    const editor = page.locator('.editor .ProseMirror');
    const img = page.locator('[data-block-id="img"]');
    // The selected block's tools (the hover tools hold only the drag handle).
    const tools = page.locator('.block-tools');
    const HOME = { section: 0, cell: 0, index: 1 };
    await expect(img).toBeVisible();
    expect(await placeOf(page, 'img')).toEqual(HOME);

    // Beside its paragraph: the end of the aside.
    await img.click();
    await tools.getByRole('button', { name: 'Move to the next column' }).click();
    await expect.poll(() => placeOf(page, 'img')).toEqual({ section: 0, cell: 1, index: 1 });
    await page.keyboard.press('Control+z');
    await expect.poll(() => placeOf(page, 'img')).toEqual(HOME);

    // Into the next section: the same cell there, at its end.
    await img.click();
    await tools.getByRole('button', { name: 'Move to the next section' }).click();
    await expect.poll(() => placeOf(page, 'img')).toEqual({ section: 1, cell: 0, index: 1 });
    await page.keyboard.press('Control+z');
    await expect.poll(() => placeOf(page, 'img')).toEqual(HOME);

    // Into a section of its own: a single column, right after its section.
    await img.click();
    await tools.getByRole('button', { name: 'Move into a section of its own' }).click();
    await expect.poll(() => placeOf(page, 'img')).toEqual({ section: 1, cell: 0, index: 0 });
    await expect(editor.locator('.page-section')).toHaveCount(4);
    await expect(editor.locator('.page-section').nth(1).locator('.grid-cell')).toHaveCount(1);
    await page.keyboard.press('Control+z');
    await expect.poll(() => placeOf(page, 'img')).toEqual(HOME);
    await expect(editor.locator('.page-section')).toHaveCount(3);
  });

  test('after a move a phone still reads each paragraph with what belongs to it, on the page and in the editor', async ({ page }) => {
    // n2 sits in the first section's aside by mistake; the second section's aside is empty.
    const { slug } = await createPage(page.request, { doc: columnsPage(section('s1', cell(para('p1')), cell(note('n1'), note('n2'))), section('s2', cell(para('p2')), cell()), section('s3', cell(para('p3')), cell(note('n3')))) });
    await page.goto(`/${slug}/edit`);
    await page.getByText('n2', { exact: true }).click();
    // The block settings panel offers the same moves.
    const panel = blockSettings(page);
    await panel.getByRole('toolbar', { name: 'Move' }).getByRole('button', { name: 'Move to the next section' }).click();
    // Into the second section's aside, its placeholder gone.
    await expect.poll(() => placeOf(page, 'n2')).toEqual({ section: 1, cell: 1, index: 0 });
    await expect(page.locator('.page-section').nth(1).locator('.grid-cell').nth(1).locator('.ph-row')).toHaveCount(0);

    await page.getByRole('radio', { name: 'Phone preview' }).click();
    await expect.poll(async () => (await top(page, 'n1')) > (await top(page, 'p1'))).toBe(true);
    await expectReadingOrder(page, ['p1', 'n1', 'p2', 'n2', 'p3', 'n3'], 'editor, phone preview');
    await save(page);

    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto(`/${slug}`);
    await expect(page.getByText('p1', { exact: true })).toBeVisible();
    await expectReadingOrder(page, ['p1', 'n1', 'p2', 'n2', 'p3', 'n3'], 'page, phone');
  });

  test('an image aligned to the end of the aside sits against its end edge, on the page and in the editor', async ({ page }) => {
    const { slug } = await createPage(page.request, { doc: columnsPage(section('s1', cell(para('p1')), cell(note('n1'), image('img')))) });
    const atEnd = () =>
      page.locator('[data-block-id="img"]').first().evaluate((frame) => {
        const f = frame.getBoundingClientRect();
        const i = frame.querySelector('img')!.getBoundingClientRect();
        return { end: Math.round(f.right - i.right), start: Math.round(i.left - f.left) };
      });
    await page.goto(`/${slug}/edit`);
    const img = page.locator('[data-block-id="img"]');
    await img.click();
    const panel = blockSettings(page);
    // Centred until placed.
    const before = await atEnd();
    expect(Math.abs(before.start - before.end)).toBeLessThanOrEqual(1);
    await panel.getByRole('radio', { name: 'End', exact: true }).click();
    await expect.poll(async () => (await atEnd()).end).toBe(0);
    expect((await atEnd()).start).toBeGreaterThan(20);
    await save(page);

    await page.goto(`/${slug}`);
    await expect(page.locator('[data-block-id="img"]')).toBeVisible();
    expect((await atEnd()).end).toBe(0);
    expect((await atEnd()).start).toBeGreaterThan(20);
    // A phone inherits the desktop's placement.
    await page.setViewportSize({ width: 390, height: 900 });
    await expect.poll(async () => (await atEnd()).end).toBe(0);
  });

  test("on a flow page a placed block sits against the reading column's edges, not the canvas's", async ({ page }) => {
    const row = (id: string, placement: unknown) => ({
      type: 'flexContainer',
      attrs: { blockId: id, placement },
      content: [{ type: 'flexCell', content: [para(`${id}-button`)] }],
    });
    const { slug } = await createPage(page.request, {
      doc: doc(para('lead'), row('end', { desktop: { align: 'end' } }), row('start', { desktop: { align: 'start' } }), row('center', { desktop: { align: 'center' } })),
    });
    const edges = (id: string) =>
      page.locator(`[data-block-id="${id}"]`).first().evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { left: Math.round(r.left), right: Math.round(r.right) };
      });
    for (const where of ['page', 'editor'] as const) {
      await page.goto(where === 'page' ? `/${slug}` : `/${slug}/edit`);
      await expect(page.getByText('lead', { exact: true })).toBeVisible();
      const column = await edges('lead');
      const end = await edges('end');
      const start = await edges('start');
      const center = await edges('center');
      expect(end.right, `${where}: end`).toBe(column.right);
      expect(end.left, `${where}: end is content-sized`).toBeGreaterThan(column.left + 100);
      expect(start.left, `${where}: start`).toBe(column.left);
      expect(start.right).toBeLessThan(column.right - 100);
      expect(Math.abs(center.left - column.left - (column.right - center.right)), `${where}: centre`).toBeLessThanOrEqual(1);
    }
  });

  test('flex cells fill by weight, a fixed one wraps rather than overflowing, and Auto stays content-sized', async ({ page }) => {
    const fcell = (id: string, flexItem?: unknown) => ({ type: 'flexCell', attrs: flexItem ? { flexItem } : {}, content: [para(id)] });
    const flex = (id: string, attrs: Record<string, unknown>, ...cells: unknown[]) => ({ type: 'flexContainer', attrs: { blockId: id, ...attrs }, content: cells });
    const fixed = { desktop: { size: 'fixed', basis: '70%' } };
    const { slug } = await createPage(page.request, {
      doc: doc(
        flex('row', {}, fcell('fa', { desktop: { size: 'fill' } }), fcell('fb', { desktop: { size: 'fill', weight: 2 } })),
        flex('wrap', { layout: { desktop: { flexWrap: 'wrap' } } }, fcell('w1', fixed), fcell('w2', fixed)),
        flex('squeeze', {}, fcell('q1', fixed), fcell('q2', fixed)),
        flex('auto', {}, fcell('a1'), fcell('a2')),
        // A row placed in the middle is as wide as its cells: a fixed one still has its size.
        flex('placed', { placement: { desktop: { align: 'center' } } }, fcell('pf', { desktop: { size: 'fixed', basis: '12rem' } })),
        // In a column the size is the height; the width stays the column's.
        flex('column', { layout: { desktop: { flexDirection: 'column' } } }, fcell('cf', { desktop: { size: 'fixed', basis: '5rem' } }))
      ),
    });
    const boxes = (ids: string[]) =>
      page.evaluate((ids) => ids.map((id) => {
        const cellEl = document.querySelector(`[data-block-id="${id}"]`)!.closest('.flex-cell')!;
        const row = cellEl.parentElement!;
        const c = cellEl.getBoundingClientRect();
        const rs = getComputedStyle(row);
        // The row's content box: what its cells share.
        const r = { width: row.clientWidth - parseFloat(rs.paddingLeft) - parseFloat(rs.paddingRight) };
        const cs = getComputedStyle(cellEl);
        // What a filling cell keeps whatever its share: its padding and border.
        const own = ['paddingLeft', 'paddingRight', 'borderLeftWidth', 'borderRightWidth'].reduce((sum, k) => sum + parseFloat(cs[k as 'paddingLeft']), 0);
        return { top: Math.round(c.top), width: c.width, height: c.height, share: c.width - own, row: r.width, overflow: row.scrollWidth > row.clientWidth };
      }), ids);

    for (const where of ['page', 'editor'] as const) {
      await page.goto(where === 'page' ? `/${slug}` : `/${slug}/edit`);
      await expect(page.getByText('fa', { exact: true })).toBeVisible();
      const [fa, fb] = await boxes(['fa', 'fb']);
      // The free space divides 1:2 (each cell keeps its padding).
      expect(Math.abs(fb.share - 2 * fa.share), `${where}: 1:2`).toBeLessThanOrEqual(2);
      expect(Math.abs(fa.width + fb.width - fa.row), `${where}: the row is filled`).toBeLessThanOrEqual(2);
      const [w1, w2] = await boxes(['w1', 'w2']);
      expect(w2.top, `${where}: the second fixed cell wraps`).toBeGreaterThan(w1.top);
      expect(Math.abs(w1.width - 0.7 * w1.row), `${where}: its own size`).toBeLessThanOrEqual(2);
      const [q1, q2] = await boxes(['q1', 'q2']);
      expect(q2.top, `${where}: no wrap, one line`).toBe(q1.top);
      expect(q1.width + q2.width, `${where}: yields rather than overflowing`).toBeLessThanOrEqual(q1.row + 1);
      expect(q1.overflow).toBe(false);
      const [a1, a2] = await boxes(['a1', 'a2']);
      expect(a1.width + a2.width, `${where}: Auto is content-sized`).toBeLessThan(a1.row / 2);
      const [pf] = await boxes(['pf']);
      expect(pf.width, `${where}: fixed in a content-sized row`).toBe(192);
      const [cf] = await boxes(['cf']);
      expect(cf.height, `${where}: fixed in a column is a height`).toBe(80);
      expect(Math.abs(cf.width - cf.row), `${where}: and the width stays the column's`).toBeLessThanOrEqual(1);
    }
  });

  test('a block dragged onto the empty part of a cell lands in it, leaving no placeholder behind', async ({ page }) => {
    const { slug } = await createPage(page.request, { doc: columnsPage(section('s1', cell(para('pa'), para('pb'), para('pc')), cell())) });
    await page.goto(`/${slug}/edit`);
    const editor = page.locator('.editor .ProseMirror');
    const aside = editor.locator('.page-section .grid-cell').nth(1);
    await expect(aside.locator('.ph-row')).toHaveCount(1);

    await page.getByText('pc', { exact: true }).hover();
    const grip = page.locator('.block-tools .bt-drag');
    await grip.hover();
    await page.mouse.down();
    // Below the aside's placeholder: the cell's own empty area.
    const box = (await aside.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height - 6, { steps: 8 });
    await page.mouse.up();

    await expect.poll(() => placeOf(page, 'pc')).toEqual({ section: 0, cell: 1, index: 0 });
    await expect(aside.locator('.ph-row')).toHaveCount(0);
    await expect(editor.locator('.page-section')).toHaveCount(1);
  });
});
