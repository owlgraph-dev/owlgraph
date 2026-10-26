// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { test, expect } from '$tests/e2e/fixtures';
import { authState } from '$tests/e2e/seed-data';
import { createPage } from '$tests/e2e/api';
import { doc, para, txt } from '$tests/e2e/doc';
import { blockSettings, stepUpTo } from '$tests/e2e/editor';
import type { Page } from '@playwright/test';

// docs/architecture/blocks/anatomy.md, "Svelte container blocks".

const tcell = (text: string, isHeader = false) => ({ type: 'tableCell', attrs: { isHeader }, content: [txt(text)] });
const flexRow = () => ({
  type: 'flexContainer',
  attrs: { blockId: 'row' },
  content: [
    { type: 'flexCell', content: [{ type: 'paragraph', attrs: { blockId: 'c1' }, content: [txt('one '), txt('active', [{ type: 'semanticProperty', attrs: { propName: 'core:status' } }])] }] },
    { type: 'flexCell', content: [{ type: 'quickLink', attrs: { blockId: 'ql', refType: 'url', url: 'https://example.com/docs', label: 'Off site', variant: 'button' } }] },
    {
      type: 'flexCell',
      content: [
        {
          type: 'table',
          attrs: { blockId: 'nt' },
          content: [
            { type: 'tableRow', attrs: { isHeader: true }, content: [tcell('H1', true), tcell('H2', true)] },
            { type: 'tableRow', attrs: { isHeader: false }, content: [tcell('a'), tcell('b')] },
          ],
        },
      ],
    },
  ],
});

const cells = (page: Page) => page.locator('.ProseMirror [data-block-id="row"] .flex-cell');

test.describe('blocks nested in a flex row', () => {
  test.use({ storageState: authState('admin'), viewport: { width: 1280, height: 900 } });

  test('text, a quick link and a table inside cells edit as anywhere else; the row takes cells and gives them back', async ({ page }) => {
    const { slug } = await createPage(page.request, { doc: doc(para('intro'), flexRow(), para('outro')) });
    await page.goto(`/${slug}/edit`);
    await expect(cells(page)).toHaveCount(3);

    // A keymap key comes after typing, which syncs the editor's selection,
    // never straight after a click. The paragraph wraps in its content-sized
    // cell, so its end is reached by a click there, not by End.
    const first = cells(page).nth(0);
    const p1 = first.locator('p').first();
    const b1 = (await p1.boundingBox())!;
    await p1.click({ position: { x: b1.width - 2, y: b1.height - 4 } });
    await page.keyboard.type(' x');
    await expect(first.locator('p').first()).toHaveText('one active x');
    await expect(first.locator('span[data-prop="core:status"]')).toHaveText('active');
    await page.keyboard.press('Enter');
    await page.keyboard.type('y');
    await expect(first.locator('p')).toHaveCount(2);
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    await expect(first.locator('p')).toHaveCount(1);

    const card = cells(page).nth(1).locator('a.quick-link');
    await card.click();
    await expect(page.locator('.block-selected')).toBeVisible();
    const label = blockSettings(page).getByRole('textbox', { name: 'Label', exact: true });
    await label.fill('Renamed');
    await label.press('Tab');
    await expect(card.locator('.quick-link-label')).toHaveText('Renamed');

    // The breadcrumb settles the click first: typing straight after one can
    // meet the selection held before (tests/e2e/editor.ts, stepUpTo).
    const nested = cells(page).nth(2).locator('[data-block-id="nt"]');
    await nested.locator('td').first().click();
    await expect(page.getByRole('navigation', { name: 'Block ancestry' }).getByRole('button', { name: 'Table cell', exact: true })).toHaveAttribute('aria-current', 'true');
    await page.keyboard.press('End');
    await page.keyboard.type('z');
    await page.keyboard.press('Tab');
    await page.keyboard.type('w');
    await expect(nested.locator('td').first()).toHaveText('az');
    await expect(nested.locator('td').nth(1)).toContainText('w');

    await first.locator('p').first().click();
    await stepUpTo(page, ['Paragraph', 'Flex cell', 'Flex row']);
    await page.getByRole('button', { name: 'Add cell', exact: true }).click();
    await expect(cells(page)).toHaveCount(4);
    await page.getByRole('button', { name: 'Remove cell', exact: true }).click();
    await expect(cells(page)).toHaveCount(3);

    // The row is deselected first: its toolbar floats over the block above it.
    await page.locator('.ProseMirror > [data-block-id="outro"]').click();
    const drag = async (id: string, to: { x: number; y: number }) => {
      // Not hover(): the block's tools appear under the pointer, and hover()'s
      // hit check would wait them out forever.
      const b = (await page.locator(`.ProseMirror [data-block-id="${id}"]`).boundingBox())!;
      await page.mouse.move(b.x + 8, b.y + b.height / 2);
      const grip = page.locator('.block-tools .bt-drag');
      await grip.hover();
      await page.mouse.down();
      await page.mouse.move(to.x, to.y, { steps: 8 });
      await page.mouse.up();
    };
    const c1 = (await first.locator('p').first().boundingBox())!;
    await drag('intro', { x: c1.x + c1.width / 2, y: c1.y + c1.height - 2 });
    await expect(first.locator('[data-block-id="intro"]')).toHaveCount(1);
    const outro = (await page.locator('.ProseMirror > [data-block-id="outro"]').boundingBox())!;
    await drag('intro', { x: outro.x + outro.width / 2, y: outro.y + outro.height - 2 });
    await expect(page.locator('.ProseMirror > [data-block-id="intro"]')).toHaveCount(1);
    await expect(first.locator('[data-block-id="intro"]')).toHaveCount(0);

    // ProseMirror folds edits within half a second into one undo step, so the
    // move in may be undone too: either way "intro" is before "outro".
    await page.keyboard.press('Control+z');
    await expect.poll(() => page.locator('.ProseMirror').evaluate((el) => {
      const ids = [...el.querySelectorAll('[data-block-id]')].map((e) => e.getAttribute('data-block-id'));
      return ids.indexOf('intro') < ids.indexOf('outro');
    })).toBe(true);

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Saved')).toBeVisible({ timeout: 15000 });

    await page.goto(`/${slug}`);
    const row = page.locator('.canvas-blocks [data-block-id="row"]');
    const pageCells = row.locator('.flex-cell');
    await expect(pageCells).toHaveCount(3);
    await expect(pageCells.nth(0).locator('span.sem-prop[data-prop="core:status"]')).toHaveText('active');
    const pageCard = pageCells.nth(1).locator('a.quick-link');
    await expect(pageCard).toHaveAttribute('data-hydrated', 'true');
    await expect(pageCard.locator('.quick-link-label')).toHaveText('Renamed');
    await pageCard.focus();
    await expect(pageCells.nth(1).locator('.quick-link-dest')).toHaveText('example.com');
    await expect(pageCells.nth(2).locator('[data-block-id="nt"] td').first()).toHaveText('az');
    expect(await row.locator('[style]').count(), 'no style attribute on the page').toBe(0);
  });
});
