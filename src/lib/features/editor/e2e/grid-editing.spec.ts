// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { test, expect } from '$tests/e2e/fixtures';
import { authState } from '$tests/e2e/seed-data';
import { createPage } from '$tests/e2e/api';
import { doc, para, cell } from '$tests/e2e/doc';
import { layoutFingerprint } from '$tests/e2e/responsive';
import { stepUpTo } from '$tests/e2e/editor';
import type { Page } from '@playwright/test';

// docs/architecture/blocks/layout.md, "Grid columns per tier".

const grid = (id: string, columnWidths: number[], attrs: Record<string, unknown>, ...cells: unknown[]) => ({
  type: 'grid',
  attrs: { blockId: id, columnWidths, ...attrs },
  content: cells,
});
const placed = (colStart: number, rowStart: number, colSpan: number, rowSpan: number, ...blocks: unknown[]) => ({
  type: 'gridCell',
  attrs: { colStart, rowStart, colSpan, rowSpan },
  content: blocks,
});
const sixCells = (prefix = '') => ['a1', 'b1', 'c1', 'a2', 'b2', 'c2'].map((t) => cell(para(`${prefix}${t}`)));
const ref = (id: string) => ({ type: 'quickLink', attrs: { blockId: id, refType: 'url', url: 'https://example.com/', label: 'Go', variant: 'button' } });

// A grid's own handles are those whose nearest block is the grid; a nested
// grid's sit inside its cells.
const geometry = (page: Page, root: string, id: string) =>
  page.locator(`${root} [data-block-id="${id}"]`).first().evaluate((block) => {
    const row = (block.matches('.grid') ? block : block.querySelector('.grid'))!;
    const cs = getComputedStyle(row);
    const own = (sel: string) => [...block.querySelectorAll<HTMLElement>(sel)].filter((h) => h.closest('[data-block-id]') === block);
    const box = (el: Element) => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };
    return {
      cols: cs.gridTemplateColumns.split(' ').map(parseFloat),
      rows: cs.gridTemplateRows.split(' ').map(parseFloat),
      gap: cs.columnGap,
      cells: [...row.children].filter((c) => c.matches('.grid-cell')).map(box),
      dividers: own('.grid-handle-divider').filter((h) => h.checkVisibility()).map(box),
      rowDividers: own('.grid-handle-row-divider').filter((h) => h.checkVisibility()).map(box),
    };
  });

async function drag(page: Page, from: { x: number; y: number }, by: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + by.x / 2, from.y + by.y / 2, { steps: 4 });
  await page.mouse.move(from.x + by.x, from.y + by.y, { steps: 4 });
  await page.mouse.up();
}

async function selectGrid(page: Page, text: string, chain = ['Paragraph', 'Cell', 'Grid']) {
  await page.locator('.ProseMirror').getByText(text, { exact: true }).click();
  await stepUpTo(page, chain);
}

const center = (b: { x: number; y: number; w: number; h: number }) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

test.describe('editing a grid', () => {
  test.use({ storageState: authState('admin'), viewport: { width: 1280, height: 900 } });

  test('a column divider resizes its columns in one undo step, and shows only where the desktop columns are drawn', async ({ page }) => {
    const ownTablet = grid('own-t', [1, 1, 1], { columnsByTier: { tablet: [1, 1] } }, ...sixCells('t'));
    const { slug } = await createPage(page.request, { doc: doc(para('intro'), grid('g', [1, 1, 1], {}, ...sixCells()), ownTablet, para('outro')) });
    await page.goto(`/${slug}/edit`);
    const before = await geometry(page, '.ProseMirror', 'g');
    expect(before.dividers).toHaveLength(2);
    // Grabbed low in the divider, clear of a cell's hover tools at its top.
    const d = before.dividers[0];
    await drag(page, { x: d.x + d.w / 2, y: d.y + d.h * 0.85 }, { x: 80, y: 0 });
    await expect.poll(async () => (await geometry(page, '.ProseMirror', 'g')).cols[0]).toBeGreaterThan(before.cols[0] + 40);
    const after = await geometry(page, '.ProseMirror', 'g');
    expect(after.dividers[0].x + after.dividers[0].w / 2).toBeCloseTo(after.cells[0].x + after.cells[0].w + parseFloat(after.gap) / 2, -1);
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(async () => Math.round((await geometry(page, '.ProseMirror', 'g')).cols[0])).toBe(Math.round(before.cols[0]));

    // A tablet with columns of its own edits them in the block settings panel, not by dividers.
    await page.getByRole('radio', { name: 'Tablet preview' }).click();
    await expect.poll(async () => (await geometry(page, '.ProseMirror', 'g')).dividers.length).toBe(2);
    await expect.poll(async () => (await geometry(page, '.ProseMirror', 'own-t')).dividers.length).toBe(0);
    await page.getByRole('radio', { name: 'Phone preview' }).click();
    await expect.poll(async () => (await geometry(page, '.ProseMirror', 'g')).dividers.length).toBe(0);
    await expect.poll(async () => (await geometry(page, '.ProseMirror', 'g')).rowDividers.length).toBe(0);
  });

  test('a divider follows a merged boundary, and a boundary a merge covers in every row has none', async ({ page }) => {
    const merged = grid('m', [1, 1, 1], {}, placed(1, 1, 2, 2, para('wide')), placed(3, 1, 1, 1, para('c1')), placed(3, 2, 1, 1, para('c2')));
    const { slug } = await createPage(page.request, { doc: doc(para('intro'), merged) });
    await page.goto(`/${slug}/edit`);
    await expect.poll(async () => (await geometry(page, '.ProseMirror', 'm')).dividers.length).toBe(1);
    const geo = await geometry(page, '.ProseMirror', 'm');
    const seam = (geo.cells[0].x + geo.cells[0].w + geo.cells[1].x) / 2;
    expect(geo.dividers[0].x + geo.dividers[0].w / 2).toBeCloseTo(seam, -1);
    expect(geo.rowDividers).toHaveLength(2);
  });

  test('a row divider sets its row\'s height in one undo step', async ({ page }) => {
    const { slug } = await createPage(page.request, { doc: doc(para('intro'), grid('g', [1, 1, 1], {}, ...sixCells()), para('outro')) });
    await page.goto(`/${slug}/edit`);
    const before = await geometry(page, '.ProseMirror', 'g');
    expect(before.rowDividers).toHaveLength(2);
    const r = before.rowDividers[0];
    // Left of the first column boundary, where only the row divider is.
    await drag(page, { x: r.x + 24, y: r.y + r.h / 2 }, { x: 0, y: 90 });
    await expect.poll(async () => (await geometry(page, '.ProseMirror', 'g')).rows[0]).toBeGreaterThan(before.rows[0] + 60);
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(async () => Math.round((await geometry(page, '.ProseMirror', 'g')).rows[0])).toBe(Math.round(before.rows[0]));
  });

  test('cells merge and unmerge from a selection, each in one undo step; a selection that cuts a merged cell offers nothing', async ({ page }) => {
    const { slug } = await createPage(page.request, { doc: doc(para('intro'), grid('g', [1, 1, 1], {}, ...sixCells()), para('outro')) });
    await page.goto(`/${slug}/edit`);
    await selectGrid(page, 'a1');
    await page.getByRole('button', { name: 'Select cells to merge', exact: true }).click();
    const cellCount = async () => (await geometry(page, '.ProseMirror', 'g')).cells.length;

    let geo = await geometry(page, '.ProseMirror', 'g');
    await drag(page, center(geo.cells[0]), { x: center(geo.cells[1]).x - center(geo.cells[0]).x, y: 0 });
    await page.getByRole('button', { name: 'Merge', exact: true }).click();
    await expect.poll(cellCount).toBe(5);
    // Undo and redo also end ProseMirror's half-second grouping of changes,
    // so the unmerge below is an undo step of its own.
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(cellCount).toBe(6);
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await expect.poll(cellCount).toBe(5);
    geo = await geometry(page, '.ProseMirror', 'g');
    expect(geo.cells[0].w).toBeCloseTo(geo.cols[0] + geo.cols[1] + parseFloat(geo.gap), -1);

    // c1 → b2 takes in half of the merged a1–b1: no merge offered.
    await drag(page, center(geo.cells[1]), { x: center(geo.cells[3]).x - center(geo.cells[1]).x, y: center(geo.cells[3]).y - center(geo.cells[1]).y });
    await expect(page.locator('.grid-handle-select-highlight.invalid')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Merge', exact: true })).toBeHidden();

    const m = center(geo.cells[0]);
    await page.mouse.move(m.x, m.y);
    await page.mouse.down();
    await page.mouse.up();
    await page.getByRole('button', { name: 'Unmerge', exact: true }).click();
    await expect.poll(cellCount).toBe(6);
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(cellCount).toBe(5);
  });

  test('the block tools add and remove columns and rows, and set the gap', async ({ page }) => {
    const { slug } = await createPage(page.request, { doc: doc(para('intro'), grid('g', [1, 1, 1], {}, ...sixCells()), para('outro')) });
    await page.goto(`/${slug}/edit`);
    const shape = async () => (await layoutFingerprint(page, '.ProseMirror'))['g'];
    await expect.poll(shape).toBe('grid 3 tracks 2x3');
    await selectGrid(page, 'a1');
    await page.getByRole('button', { name: 'Add column', exact: true }).click();
    await expect.poll(shape).toBe('grid 4 tracks 2x4');
    await page.getByRole('button', { name: 'Remove column', exact: true }).click();
    await expect.poll(shape).toBe('grid 3 tracks 2x3');
    await page.getByRole('button', { name: 'Add row', exact: true }).click();
    await expect.poll(shape).toBe('grid 3 tracks 3x3');
    await page.getByRole('button', { name: 'Remove row', exact: true }).click();
    await expect.poll(shape).toBe('grid 3 tracks 2x3');
    expect((await geometry(page, '.ProseMirror', 'g')).gap).toBe('16px');
    await page.getByRole('radio', { name: 'Gap lg', exact: true }).click();
    await expect.poll(async () => (await geometry(page, '.ProseMirror', 'g')).gap).toBe('24px');
    await expect.poll(async () => (await geometry(page, '.ProseMirror', 'g')).dividers.length).toBe(2);
  });

  test('a grid inside a grid edits on its own, and survives its outer grid being rebuilt', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    const inner = grid('inner', [1, 1], {}, cell(para('i1')), cell(para('i2')));
    const outer = grid('outer', [1, 1], {}, cell(para('o1'), inner), cell(para('o2')));
    const { slug } = await createPage(page.request, { doc: doc(para('intro'), outer, para('outro')) });
    await page.goto(`/${slug}/edit`);
    const shape = async (id: string) => (await layoutFingerprint(page, '.ProseMirror'))[id];

    await selectGrid(page, 'i1');
    await page.getByRole('button', { name: 'Add column', exact: true }).click();
    await expect.poll(() => shape('inner')).toBe('grid 3 tracks 1x3');
    await expect.poll(async () => (await geometry(page, '.ProseMirror', 'inner')).dividers.length).toBe(2);

    await page.locator('.ProseMirror > [data-block-id="outro"]').click();
    await selectGrid(page, 'o2');
    await page.getByRole('button', { name: 'Add column', exact: true }).click();
    await expect.poll(() => shape('outer')).toBe('grid 3 tracks 1x3');
    await expect.poll(() => shape('inner')).toBe('grid 3 tracks 1x3');
    await expect.poll(async () => {
      const g = await geometry(page, '.ProseMirror', 'inner');
      return g.dividers.length === 2 && g.dividers.every((d, k) => Math.abs(d.x + d.w / 2 - (g.cells[k].x + g.cells[k].w + parseFloat(g.gap) / 2)) < 3);
    }).toBe(true);
    expect(errors).toEqual([]);
  });

  test('a page section and a query template are the same grid, without the construction handles of their own', async ({ page }) => {
    const ARTIKEL = { mode: 'columns', template: { desktop: [3, 2], tablet: [3, 2], phone: [1] }, preset: 'main-aside' };
    const { slug: sectionPage } = await createPage(page.request, {
      doc: { type: 'doc', attrs: { layout: ARTIKEL }, content: [{ type: 'pageSection', attrs: { blockId: 's1' }, content: [cell(para('main')), cell(para('aside'))] }] },
    });
    await page.goto(`/${sectionPage}/edit`);
    const s = await geometry(page, '.ProseMirror', 's1');
    expect(s.cells).toHaveLength(2);
    expect(s.dividers).toHaveLength(0);
    expect(s.rowDividers).toHaveLength(0);
    await expect(page.locator('.ProseMirror [data-block-id="s1"] .grid-handle-select-layer')).toHaveCount(0);
    await page.locator('.ProseMirror').getByText('main', { exact: true }).click();
    await page.keyboard.press('End');
    await page.keyboard.type(' text');
    await expect(page.locator('.ProseMirror [data-block-id="main"]')).toHaveText('main text');

    const template = grid('tpl-grid', [1], {}, cell(para('tpl')));
    const { slug: queryPage } = await createPage(page.request, {
      doc: doc(para('intro'), { type: 'queryBlock', attrs: { blockId: 'q', filter: { property: { name: 'core:none', operator: 'EQ', value: 'x' } }, first: 5 }, content: [template] }),
    });
    await page.goto(`/${queryPage}/edit`);
    await expect.poll(async () => (await geometry(page, '.ProseMirror', 'tpl-grid')).cells.length).toBe(1);
    await page.locator('.ProseMirror').getByText('tpl', { exact: true }).click();
    await page.keyboard.press('End');
    await page.keyboard.type('X');
    await expect(page.locator('.ProseMirror [data-block-id="tpl"]')).toHaveText('tplX');
  });

  test('the page draws the tracks, a merged cell, a row floor and a hydrated card, with no style attribute', async ({ page }) => {
    const merged = grid('m', [2, 1], { rowHeights: [160] }, placed(1, 1, 2, 1, para('wide')), placed(1, 2, 1, 1, ref('card')), placed(2, 2, 1, 1, para('c2')));
    const { slug } = await createPage(page.request, { doc: doc(para('intro'), merged) });
    await page.goto(`/${slug}`);
    const geo = await geometry(page, '.canvas-blocks', 'm');
    expect(geo.cols).toHaveLength(2);
    expect(geo.cols[0]).toBeCloseTo(geo.cols[1] * 2, -1);
    expect(geo.cells[0].w).toBeCloseTo(geo.cols[0] + geo.cols[1] + parseFloat(geo.gap), -1);
    expect(geo.rows[0]).toBeGreaterThanOrEqual(160);
    await expect(page.locator('.canvas-blocks [data-block-id="card"] a.quick-link')).toHaveAttribute('data-hydrated', 'true');
    expect(await page.locator('.canvas-blocks [data-block-id="m"]').evaluate((el) => el.querySelectorAll('[style]').length + (el.hasAttribute('style') ? 1 : 0))).toBe(0);
  });
});

// Under the editor's pre-wrap, a stray space beside what a container draws
// would be a line of its own.
test.describe('containers in the editor', () => {
  test.use({ storageState: authState('admin'), viewport: { width: 1280, height: 900 } });

  test('a grid, a flex row and a table are as tall as what they draw, in the editor as on the page', async ({ page }) => {
    const tcell = (t: string, isHeader = false) => ({ type: 'tableCell', attrs: { isHeader }, content: [{ type: 'text', text: t }] });
    const flex = { type: 'flexContainer', attrs: { blockId: 'f' }, content: [{ type: 'flexCell', content: [para('f1')] }, { type: 'flexCell', content: [para('f2')] }] };
    const table = { type: 'table', attrs: { blockId: 't' }, content: [{ type: 'tableRow', attrs: { isHeader: true }, content: [tcell('A', true), tcell('B', true)] }, { type: 'tableRow', attrs: { isHeader: false }, content: [tcell('a'), tcell('b')] }] };
    const { slug } = await createPage(page.request, { doc: doc(para('intro'), grid('g', [1, 1], {}, cell(para('g1')), cell(para('g2'))), flex, table, para('outro')) });
    const slack = (root: string) =>
      page.locator(root).evaluate((r) =>
        Object.fromEntries(
          [['g', ':scope > .grid'], ['f', ':scope > .flex'], ['t', 'table']].map(([id, inner]) => {
            const block = r.querySelector(`[data-block-id="${id}"]`)!;
            return [id, Math.round(block.getBoundingClientRect().height - block.querySelector(inner)!.getBoundingClientRect().height)];
          })
        )
      );
    await page.goto(`/${slug}`);
    expect(await slack('.canvas-blocks')).toEqual({ g: 0, f: 0, t: 0 });
    await page.goto(`/${slug}/edit`);
    await page.locator('.ProseMirror [data-block-id="t"] td').first().waitFor();
    await expect.poll(() => slack('.ProseMirror')).toEqual({ g: 0, f: 0, t: 0 });
  });
});

test.describe('a grid in the phone editor', () => {
  test.use({ storageState: authState('admin'), hasTouch: true, viewport: { width: 390, height: 844 } });

  test('its cells edit; nothing of the construction chrome takes a touch', async ({ page }) => {
    const { slug } = await createPage(page.request, { doc: doc(para('intro'), grid('g', [1, 1], {}, cell(para('left')), cell(para('right')))) });
    await page.goto(`/${slug}/edit`);
    const target = page.locator('.ProseMirror').getByText('right', { exact: true });
    await target.tap();
    await page.keyboard.press('End');
    await page.keyboard.type('!');
    await expect(page.locator('.ProseMirror [data-block-id="right"]')).toHaveText('right!');
    await expect(page.locator('.ProseMirror [data-block-id="g"] .grid-handle-select-layer.active')).toHaveCount(0);
  });
});
