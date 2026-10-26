// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { test, expect } from '$tests/e2e/fixtures';
import { authState } from '$tests/e2e/seed-data';
import { createPage } from '$tests/e2e/api';
import { doc, para, txt } from '$tests/e2e/doc';
import type { Page } from '@playwright/test';

// docs/architecture/blocks/layout.md, "Cell boundaries".

const ARTIKEL = { mode: 'columns', template: { desktop: [3, 2], tablet: [3, 2], phone: [1] }, preset: 'main-aside' };
const fcell = (...content: unknown[]) => ({ type: 'flexCell', content });
const gcell = (...content: unknown[]) => ({ type: 'gridCell', content });
const tcell = (text: string, isHeader = false) => ({ type: 'tableCell', attrs: { isHeader }, content: [txt(text)] });
const row = { type: 'flexContainer', attrs: { blockId: 'box' }, content: [fcell(para('alpha one'), para('alpha two')), fcell(para('bravo one')), fcell(para('charlie one'))] };

const cells = (page: Page, cellSelector: string) =>
  page.locator('.ProseMirror [data-block-id="box"]').evaluate(
    (box, sel) => [...box.querySelectorAll(sel)].map((c) => (c.matches('td, th') ? c.textContent : [...c.querySelectorAll('p')].map((p) => p.textContent).join('/'))),
    cellSelector
  );

async function inText(page: Page, text: string, share: number) {
  const el = page.locator('.ProseMirror').getByText(text, { exact: true }).first();
  await el.scrollIntoViewIfNeeded();
  return el.evaluate((node, s) => {
    const range = document.createRange();
    range.selectNodeContents(node);
    const r = range.getBoundingClientRect();
    return { x: r.left + r.width * s, y: r.top + r.height / 2 };
  }, share);
}

interface EditorView {
  state: { selection: { anchor: number; head: number } };
  posAtDOM(node: Node, offset: number): number;
}

// The browser's selection from a third into `from` to the middle of `to`, as a
// drag makes it, but through the Selection API: where a drag's path runs
// depends on where the fonts set the text. The editor takes it as it takes a
// drag's, and it is settled once the editor has written its clamped selection
// back; a key pressed before that would replace the browser's, across the cells.
async function selectAcross(page: Page, from: string, to: string) {
  await page.locator('.ProseMirror').evaluate((editor, [from, to]) => {
    // In the innermost element holding exactly the text, as getByText's exact match.
    const point = (text: string, share: number): [Node, number] => {
      const el = [...editor.querySelectorAll('*')].find((e) => e.textContent === text && ![...e.children].some((c) => c.textContent === text));
      if (!el) throw new Error(`No "${text}" in the editor`);
      let offset = Math.round(text.length * share);
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let t = walker.nextNode(); t; t = walker.nextNode()) {
        if (offset <= t.textContent!.length) return [t, offset];
        offset -= t.textContent!.length;
      }
      throw new Error(`No text node in "${text}"`);
    };
    const [a, b] = [point(from, 0.3), point(to, 0.5)];
    (editor as HTMLElement).focus();
    getSelection()!.setBaseAndExtent(a[0], a[1], b[0], b[1]);
  }, [from, to]);
  await expect.poll(() => page.locator('.ProseMirror').evaluate((el) => {
    const { view } = (el as unknown as { editor: { view: EditorView } }).editor;
    const dom = getSelection();
    if (!dom?.anchorNode || !dom.focusNode || dom.isCollapsed) return false;
    const { anchor, head } = view.state.selection;
    return view.posAtDOM(dom.anchorNode, dom.anchorOffset) === anchor && view.posAtDOM(dom.focusNode, dom.focusOffset) === head;
  })).toBe(true);
}

// Two frames: the browser has reported a key's selection change, and the
// editor has taken it (and written its clamped selection back).
const settle = (page: Page) => page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));

// A keymap key (Ctrl+A) reads the editor's selection, which follows a click
// only once the browser reports it; the breadcrumb shows when it has
// (tests/e2e/editor.ts).
async function caretInCell(page: Page, cell: string) {
  const crumbs = page.getByRole('navigation', { name: 'Block ancestry' });
  await expect(crumbs.getByRole('button', { name: cell, exact: true })).toBeVisible();
  await expect(crumbs.getByRole('button', { name: 'Paragraph', exact: true })).toHaveAttribute('aria-current', 'true');
}

const selected = (page: Page) => page.evaluate(() => getSelection()?.toString().replace(/\s+/g, ' ').trim());

test.describe('a text selection stays in its cell', () => {
  test.use({ storageState: authState('admin'), viewport: { width: 1280, height: 900 } });

  test('a selection from one flex cell into the next ends at the end of the first; typing changes only that cell', async ({ page }) => {
    const { slug } = await createPage(page.request, { doc: doc(para('intro'), row, para('outro')) });
    await page.goto(`/${slug}/edit`);
    await selectAcross(page, 'alpha one', 'bravo one');
    await expect.poll(() => selected(page)).toMatch(/alpha two$/);
    await page.keyboard.type('X');
    await expect.poll(() => cells(page, '.flex-cell')).toEqual([expect.stringMatching(/^al[^/]*X$/), 'bravo one', 'charlie one']);
  });

  test('Shift+ArrowDown stops at the end of the cell', async ({ page }) => {
    const { slug } = await createPage(page.request, { doc: doc(para('intro'), row, para('outro')) });
    await page.goto(`/${slug}/edit`);
    const a = await inText(page, 'alpha one', 0.3);
    await page.mouse.click(a.x, a.y);
    // The click-then-key race (tests/e2e/editor.ts).
    await expect.poll(() => page.evaluate(() => getSelection()?.anchorNode?.textContent)).toBe('alpha one');
    await page.keyboard.press('Home');
    for (let i = 0; i < 3; i++) {
      await settle(page);
      await page.keyboard.press('Shift+ArrowDown');
    }
    await settle(page);
    await expect.poll(() => selected(page)).toBe('alpha one alpha two');
    await page.keyboard.type('X');
    await expect.poll(() => cells(page, '.flex-cell')).toEqual(['X', 'bravo one', 'charlie one']);
  });

  test('Ctrl+A selects the paragraph first, the page second', async ({ page }) => {
    const { slug } = await createPage(page.request, { doc: doc(para('intro'), row, para('outro')) });
    await page.goto(`/${slug}/edit`);
    const a = await inText(page, 'alpha one', 0.3);
    await page.mouse.click(a.x, a.y);
    await caretInCell(page, 'Flex cell');
    await page.keyboard.press('ControlOrMeta+a');
    await expect.poll(() => selected(page)).toBe('alpha one');
    await page.keyboard.press('ControlOrMeta+a');
    await expect.poll(() => selected(page)).toMatch(/^intro .* outro$/);
    await page.mouse.click(a.x, a.y);
    await caretInCell(page, 'Flex cell');
    await page.keyboard.press('ControlOrMeta+a');
    await expect.poll(() => selected(page)).toBe('alpha one');
    await page.keyboard.type('X');
    await expect.poll(() => cells(page, '.flex-cell')).toEqual(['X/alpha two', 'bravo one', 'charlie one']);
    await expect(page.locator('.ProseMirror > p')).toHaveText(['intro', 'outro']);
  });

  test('a selection from a paragraph into a row stops before the row; one across the row takes it whole', async ({ page }) => {
    const { slug } = await createPage(page.request, { doc: doc(para('intro text'), row, para('outro text')) });
    await page.goto(`/${slug}/edit`);
    await selectAcross(page, 'intro text', 'bravo one');
    await expect.poll(() => selected(page)).toMatch(/text$/);
    await page.keyboard.type('X');
    const intro = page.locator('.ProseMirror > p').first();
    await expect(intro).toHaveText(/^in\w*X$/);
    await expect.poll(() => cells(page, '.flex-cell')).toEqual(['alpha one/alpha two', 'bravo one', 'charlie one']);

    await selectAcross(page, (await intro.textContent())!, 'outro text');
    await page.keyboard.press('Backspace');
    await expect(page.locator('.ProseMirror [data-block-id="box"]')).toHaveCount(0);
    await expect(page.locator('.ProseMirror > p')).toHaveCount(1);
    await expect(intro).toHaveText(/^i.* text$/);
  });

  test('a grid keeps its cells', async ({ page }) => {
    const grid = { type: 'grid', attrs: { blockId: 'box', columnWidths: [1, 1, 1] }, content: [gcell(para('alpha one')), gcell(para('bravo one')), gcell(para('charlie one'))] };
    const { slug } = await createPage(page.request, { doc: doc(para('intro'), grid, para('outro')) });
    await page.goto(`/${slug}/edit`);
    await selectAcross(page, 'alpha one', 'charlie one');
    await page.keyboard.type('X');
    await expect.poll(() => cells(page, '.grid-cell')).toEqual([expect.stringMatching(/^al\w*X$/), 'bravo one', 'charlie one']);
    await selectAcross(page, 'bravo one', 'outro');
    await page.keyboard.type('Y');
    await expect.poll(() => cells(page, '.grid-cell')).toEqual([expect.stringMatching(/^al\w*X$/), expect.stringMatching(/^br\w*Y$/), 'charlie one']);
    await expect(page.locator('.ProseMirror > p').last()).toHaveText('outro');
  });

  test("a page section keeps its columns' cells", async ({ page }) => {
    const section = (id: string, ...c: unknown[]) => ({ type: 'pageSection', attrs: { blockId: id }, content: c });
    const { slug } = await createPage(page.request, {
      doc: { type: 'doc', attrs: { layout: ARTIKEL }, content: [section('box', gcell(para('alpha one')), gcell(para('bravo one'))), section('next', gcell(para('outro')), gcell(para('aside')))] },
    });
    await page.goto(`/${slug}/edit`);
    await selectAcross(page, 'alpha one', 'bravo one');
    await page.keyboard.press('Delete');
    await page.keyboard.type('X');
    await expect.poll(() => cells(page, '.grid-cell')).toEqual([expect.stringMatching(/^al\w*X$/), 'bravo one']);
    await expect(page.locator('.ProseMirror [data-block-id="next"] .grid-cell')).toHaveCount(2);
  });

  test('a table row keeps its cells', async ({ page }) => {
    const table = { type: 'table', attrs: { blockId: 'box' }, content: [{ type: 'tableRow', attrs: { isHeader: true }, content: [tcell('Head one', true), tcell('Head two', true)] }, { type: 'tableRow', attrs: { isHeader: false }, content: [tcell('alpha one'), tcell('bravo one')] }] };
    const { slug } = await createPage(page.request, { doc: doc(para('intro'), table, para('outro')) });
    await page.goto(`/${slug}/edit`);
    await selectAcross(page, 'alpha one', 'bravo one');
    await page.keyboard.type('X');
    await expect.poll(() => cells(page, 'td, th')).toEqual(['Head one', 'Head two', expect.stringMatching(/^al\w*X$/), 'bravo one']);
  });

  test("Ctrl+A in a table cell selects the cell's text", async ({ page }) => {
    const table = { type: 'table', attrs: { blockId: 'box' }, content: [{ type: 'tableRow', attrs: { isHeader: true }, content: [tcell('Head one', true), tcell('Head two', true)] }, { type: 'tableRow', attrs: { isHeader: false }, content: [tcell('alpha one'), tcell('bravo one')] }] };
    const { slug } = await createPage(page.request, { doc: doc(para('intro'), table, para('outro')) });
    await page.goto(`/${slug}/edit`);
    // A locator click waits out the table's hover handles, which take a click near a cell's edge.
    await page.locator('.ProseMirror td', { hasText: 'alpha one' }).click();
    await expect(page.getByRole('navigation', { name: 'Block ancestry' }).getByRole('button', { name: 'Table cell', exact: true })).toHaveAttribute('aria-current', 'true');
    await page.keyboard.press('ControlOrMeta+a');
    await expect.poll(() => selected(page)).toBe('alpha one');
    await page.keyboard.type('X');
    await expect.poll(() => cells(page, 'td, th')).toEqual(['Head one', 'Head two', 'X', 'bravo one']);
  });
});
