// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import type { Locator, Page } from '@playwright/test';
import { test, expect, waitForHydration } from '../fixtures';
import { authState } from '../seed-data';
import { createPage, formAction, unique } from '../api';
import { db } from '../../../src/lib/platform/db.server';

interface Caret {
  /** The nodes the caret sits in, outermost first, each with its index in its parent: `tableCell#0`. */
  steps: string[];
  /** The text of the block the caret is in. */
  block: string;
  /** The selected text; empty for a caret. */
  selected: string;
  atStart: boolean;
}

/** The editor's own selection (tests/e2e/editor.ts): what the toolbar and the Insert menu act on. */
function caret(editor: Locator): Promise<Caret> {
  return editor.evaluate((el) => {
    type Node = { type: { name: string }; textContent: string };
    type Resolved = { depth: number; parentOffset: number; parent: Node; node(d: number): Node; index(d: number): number };
    type State = { selection: { from: number; to: number; $from: Resolved }; doc: { textBetween(from: number, to: number): string } };
    const { state } = (el as unknown as { editor: { state: State } }).editor;
    const { $from, from, to } = state.selection;
    const steps: string[] = [];
    for (let d = 1; d <= $from.depth; d++) steps.push(`${$from.node(d).type.name}#${$from.index(d - 1)}`);
    return { steps, block: $from.parent.textContent, selected: state.doc.textBetween(from, to), atStart: $from.parentOffset === 0 };
  });
}

/** Clicks until the editor holds the caret there: it settles a click's selection after the mouse events. */
async function clickUntil(page: Page, click: () => Promise<void>, holds: (c: Caret) => void) {
  const editor = page.locator('.ProseMirror');
  await expect(async () => {
    await click();
    holds(await caret(editor));
  }).toPass({ timeout: 10_000 });
}

/** The caret into the text block that reads `text`. */
async function caretInto(page: Page, text: string) {
  await clickUntil(page, () => page.locator('.ProseMirror').getByText(text, { exact: true }).click(), (c) => expect(c.block).toBe(text));
}

/** Types into an empty cell of a grid or a flex row: its placeholder becomes a paragraph. */
async function typeIntoEmptyCell(page: Page, cell: Locator, cellType: 'gridCell' | 'flexCell', text: string) {
  await clickUntil(
    page,
    async () => {
      const box = (await cell.locator('.ph-content').boundingBox())!;
      await page.mouse.click(box.x + 20, box.y + box.height / 2);
    },
    (c) => expect(c.steps.slice(-2)).toEqual([`${cellType}#0`, 'placeholder#0'])
  );
  await page.keyboard.type(text);
  await expect(cell.locator('p')).toHaveText(text);
}

async function insert(page: Page, item: string) {
  await page.getByRole('button', { name: 'Insert', exact: true }).click();
  await page.getByRole('menuitem', { name: item, exact: true }).click();
}

/** The ids of the top-level blocks, in order. */
const topLevelIds = (root: Locator) => root.evaluate((el) => [...el.children].map((c) => c.getAttribute('data-block-id')).filter((id) => id !== null));

const HEADING = 'A page of the journey';
const LEAD = 'Lead paragraph in a named style.';
const TABLE_CELL = 'Typed into the table';
const GRID_CELL = 'Typed into the grid';
const FLEX_CELL = 'Typed into the flex row';

test.describe('writing and publishing a page', () => {
  // A site stylesheet styles every page, so this runs alone.
  test.use({ storageState: { cookies: [], origins: [] }, siteWide: true });

  let sheet = unique('Journey sheet');

  test.afterEach(async () => {
    // Through the database, so a test that fails halfway leaves no stylesheet behind.
    await db`delete from stylesheets where name = ${sheet.name}`;
  });

  test('an editor makes a page from Create, writes it, saves it, and a reader sees the same on the page', async ({ page: reader, browser }) => {
    test.setTimeout(120_000);
    sheet = unique('Journey sheet');
    const style = unique('Journey lead');
    // slugFromLabel (site/customStyles/slug.ts): the class the style renders as.
    const styleClass = `cs-${style.slug}`;

    // The named style's stylesheet, through the settings form actions.
    const admin = await browser.newContext({ storageState: authState('admin') });
    expect((await formAction(admin.request, '/settings/styles?/createSheet', { name: sheet.name })).type).toBe('success');
    const [{ id: sheetId }] = await db<{ id: string }[]>`select id from stylesheets where name = ${sheet.name}`;
    expect((await formAction(admin.request, `/settings/styles/${sheetId}?/createStyle`, { label: style.name, kind: 'inline', css: 'font-weight: 700;' })).type).toBe('success');
    await admin.close();

    const editorContext = await browser.newContext({ storageState: authState('editorA'), viewport: { width: 1280, height: 900 } });
    try {
      // The quick link's target: a page anyone may read.
      const target = await createPage(editorContext.request, { visibility: null, title: unique('Journey target').name });
      const [{ title: targetTitle }] = await db<{ title: string }[]>`select title from nodes where id = ${target.id}`;
      const editor = await editorContext.newPage();
      const canvas = editor.locator('.ProseMirror');
      let slug = '';
      let pageId = '';

      await test.step('an editor makes a page from Create', async () => {
        await editor.goto('/');
        await editor.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: 'Create' }).click();
        await editor.getByRole('dialog', { name: 'Create' }).getByRole('button', { name: 'Page' }).click();
        // The editor opens as a fresh document (CreateModal.svelte).
        await expect(editor).toHaveURL(/\/edit$/);
        await waitForHydration(editor);
        await expect(editor.locator('.ProseMirror[contenteditable="true"]')).toBeVisible();
        await expect(editor.getByRole('button', { name: 'Untitled', exact: true })).toBeVisible();
        slug =new URL(editor.url()).pathname.replace(/^\//, '').replace(/\/edit$/, '');
        [{ id: pageId }] = await db<{ id: string }[]>`select id from nodes where slug = ${slug} and type = 'page'`;
      });

      await test.step('they write its text: a heading in a paragraph style, a run in a named style', async () => {
        await expect(async () => {
          await canvas.click();
          await expect(canvas).toBeFocused({ timeout: 1000 });
        }).toPass({ timeout: 10_000 });
        for (const [i, line] of [HEADING, LEAD, 'A table follows.', 'A grid follows.', 'A flex row follows.', 'A quick link follows.'].entries()) {
          if (i) await editor.keyboard.press('Enter');
          await editor.keyboard.type(line);
        }
        await expect(canvas.locator('p').last()).toHaveText('A quick link follows.');

        await caretInto(editor, HEADING);
        await editor.getByRole('button', { name: 'Paragraph style' }).click();
        await editor.getByRole('menuitem', { name: /^Subtitle\b/ }).click();
        await expect(canvas.locator('h2[data-paragraph-style]')).toHaveText(HEADING);

        // "Lead", selected by keyboard from the start of its paragraph.
        await caretInto(editor, LEAD);
        await expect(async () => {
          await editor.keyboard.press('Home');
          expect(await caret(canvas)).toMatchObject({ block: LEAD, atStart: true, selected: '' });
        }).toPass({ timeout: 10_000 });
        await editor.keyboard.down('Shift');
        for (let i = 0; i < 4; i++) await editor.keyboard.press('ArrowRight');
        await editor.keyboard.up('Shift');
        await expect.poll(async () => (await caret(canvas)).selected).toBe('Lead');
        await editor.getByRole('button', { name: 'Text style', exact: true }).click();
        await editor.getByRole('button', { name: new RegExp(`^${style.name}`) }).click();
        await expect(canvas.locator(`.${styleClass}`)).toHaveText('Lead');
      });

      await test.step('they insert a table, a grid, a flex row and a quick link, and fill them', async () => {
        await caretInto(editor, 'A table follows.');
        await insert(editor, 'Table');
        const table = canvas.locator('table.table-block-table');
        await expect(table.locator('th')).toHaveText(['Column A', 'Column B']);
        await clickUntil(editor, () => table.locator('td').first().click(), (c) => expect(c.steps.slice(-2)).toEqual(['tableRow#1', 'tableCell#0']));
        await editor.keyboard.type(TABLE_CELL);
        await expect(table.locator('td').first()).toHaveText(TABLE_CELL);

        await caretInto(editor, 'A grid follows.');
        await insert(editor, 'Grid');
        const gridCells = canvas.locator('.grid-cell');
        await expect(gridCells).toHaveCount(2);
        await typeIntoEmptyCell(editor, gridCells.first(), 'gridCell', GRID_CELL);

        await caretInto(editor, 'A flex row follows.');
        await insert(editor, 'Flex row');
        const flexCells = canvas.locator('.flex-cell');
        await expect(flexCells).toHaveCount(2);
        await typeIntoEmptyCell(editor, flexCells.first(), 'flexCell', FLEX_CELL);

        await caretInto(editor, 'A quick link follows.');
        await insert(editor, 'Quick link');
        await editor.getByPlaceholder('Search pages & documents… or paste a URL or /path').fill(targetTitle);
        await editor.getByRole('option', { name: new RegExp(`^${targetTitle}`) }).click();
        await expect(canvas.locator('a.quick-link .quick-link-label')).toHaveText(targetTitle);
      });

      let written: string[] = [];
      await test.step('they save', async () => {
        const saved = editor.waitForResponse((r) => r.request().method() === 'PUT' && new URL(r.url()).pathname === `/api/pages/${pageId}`);
        await editor.getByRole('button', { name: 'Save', exact: true }).click();
        expect((await saved).ok()).toBe(true);
        await expect(editor.getByText(/^Saved /)).toBeVisible();
        written = await topLevelIds(canvas);
        // The six text blocks and the four inserted ones.
        expect(written).toHaveLength(10);
      });

      await test.step('a reader sees the same on the page', async () => {
        await reader.goto(`/${slug}`);
        const blocks = reader.locator('.canvas-blocks');
        // The blocks the editor wrote, in its order.
        expect(await topLevelIds(blocks)).toEqual(written);
        const heading = blocks.getByRole('heading', { level: 2, name: HEADING });
        await expect(heading).toBeVisible();
        // Subtitle's look: 2xl is 1.5rem.
        await expect(heading).toHaveCSS('font-size', '24px');
        const styled = blocks.locator(`.${styleClass}`);
        await expect(styled).toHaveText('Lead');
        await expect(styled).toHaveCSS('font-weight', '700');
        const table = blocks.locator('table.table-block-table');
        await expect(table.locator('th')).toHaveText(['Column A', 'Column B']);
        await expect(table.locator('td').first()).toHaveText(TABLE_CELL);
        await expect(blocks.locator('.grid-cell').first()).toHaveText(GRID_CELL);
        await expect(blocks.locator('.flex-cell').first()).toHaveText(FLEX_CELL);
        const card = blocks.locator('a.quick-link');
        await expect(card).toHaveAttribute('data-hydrated', 'true');
        await expect(card.locator('.quick-link-label')).toHaveText(targetTitle);
      });

      await test.step('the quick link takes the reader to its page', async () => {
        await reader.locator('.canvas-blocks a.quick-link').click();
        await expect(reader).toHaveURL(new RegExp(`/${target.slug}$`));
        await expect(reader).toHaveTitle(new RegExp(targetTitle));
      });
    } finally {
      await editorContext.close();
    }
  });
});
