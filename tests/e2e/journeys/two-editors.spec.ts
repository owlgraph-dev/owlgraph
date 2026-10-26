// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import type { Browser, Locator, Page } from '@playwright/test';
import { test, expect } from '../fixtures';
import { authState } from '../seed-data';
import { createPage } from '../api';
import { doc, para } from '../doc';
import { savePage } from '../editor';

const editing = (page: Page) => page.locator('.ProseMirror[contenteditable="true"]');
const block = (page: Page, root: string, id: string) => page.locator(`${root} [data-block-id="${id}"]`);
const LOCK_LOST = 'Your edit lock was taken over, so this page is now read-only.';

/** The block the editor's own caret is in, and whether it sits at that block's end (tests/e2e/editor.ts). */
function caret(editor: Locator): Promise<{ blockId: unknown; atEnd: boolean }> {
  return editor.evaluate((el) => {
    type Selection = { empty: boolean; $from: { parentOffset: number; parent: { attrs: Record<string, unknown>; content: { size: number } } } };
    const { $from, empty } = (el as unknown as { editor: { state: { selection: Selection } } }).editor.state.selection;
    return { blockId: $from.parent.attrs.blockId, atEnd: empty && $from.parentOffset === $from.parent.content.size };
  });
}

/** Types at the end of a block, once the editor's caret is there: it settles a click's selection after the mouse events. */
async function typeAtEnd(page: Page, blockId: string, text: string) {
  const editor = page.locator('.ProseMirror');
  await expect(async () => {
    await editor.locator(`[data-block-id="${blockId}"]`).click();
    await page.keyboard.press('End');
    expect(await caret(editor)).toEqual({ blockId, atEnd: true });
  }).toPass({ timeout: 10_000 });
  await page.keyboard.type(text);
}

/**
 * On a restricted page of editorA's. `savedInEditor`: the first editor saves
 * once first; otherwise the page stays as the API stored it, as an agent's write does.
 */
async function twoEditors(second: Page, browser: Browser, { savedInEditor }: { savedInEditor: boolean }) {
  const firstContext = await browser.newContext({ storageState: authState('editorA') });
  try {
    const { id, slug } = await createPage(firstContext.request, { doc: doc(para('first'), para('second')) });
    const first = await firstContext.newPage();
    // The heartbeat runs on the page's clock, which the test moves on.
    await first.clock.install();
    const firstText = savedInEditor ? 'first, saved and unsaved' : 'first and unsaved';

    await test.step('the first editor opens the page and writes without saving', async () => {
      await first.goto(`/${slug}/edit`);
      await expect(editing(first)).toBeVisible();
      if (savedInEditor) {
        await typeAtEnd(first, 'first', ', saved');
        await savePage(first, id);
      }
      await typeAtEnd(first, 'first', ' and unsaved');
      await expect(block(first, '.ProseMirror', 'first')).toHaveText(firstText);
    });

    await test.step('the second opens it, sees who is editing, and takes it over', async () => {
      await second.goto(`/${slug}/edit`);
      await expect(second.getByRole('heading', { name: 'Page is being edited' })).toBeVisible();
      await expect(second.getByText('editora currently has this page open for editing.')).toBeVisible();
      let asked = '';
      second.once('dialog', (dialog) => {
        asked = dialog.message();
        void dialog.accept();
      });
      await second.getByRole('button', { name: 'Take over', exact: true }).click();
      await expect(editing(second)).toBeVisible();
      expect(asked).toContain('editora will be switched to read-only');
    });

    await test.step('the first goes read-only under the lock-lost banner, its unsaved work kept as a draft', async () => {
      await first.clock.runFor(20_000);
      await expect(first.getByText(LOCK_LOST)).toBeVisible();
      await expect(first.locator('.ProseMirror')).toHaveAttribute('contenteditable', 'false');
      await expect(block(first, '.ProseMirror', 'first')).toHaveText(firstText);
      await expect(first.getByRole('heading', { name: 'Your edit lock was taken over' })).toBeVisible();
      await expect(first.getByText('Your unsaved work has been saved as a draft')).toBeVisible();
      // The one block the first editor changed, and nothing else.
      await expect(first.getByText('0 added · 1 changed · 0 deleted')).toBeVisible();
    });

    await test.step('the second saves an edit of its own and leaves the editor', async () => {
      await typeAtEnd(second, 'second', ' by the second editor');
      await savePage(second, id);
      await second.goto(`/${slug}`);
      // Leaving the editor gives the lock back, which applying the draft takes.
      await expect.poll(async () => ((await (await firstContext.request.get(`/api/pages/${id}/lock`)).json()) as { locked: boolean }).locked).toBe(false);
    });

    await test.step("the first applies its draft's picks, onto the page as the second left it", async () => {
      await first.getByRole('button', { name: 'Apply selected to the page', exact: true }).click();
      // The editor reloads on the merged page, editable again.
      await expect(editing(first)).toBeVisible();
      await expect(block(first, '.ProseMirror', 'first')).toHaveText(firstText);
      await expect(block(first, '.ProseMirror', 'second')).toHaveText('second by the second editor');
      await expect(first.getByText(LOCK_LOST)).toHaveCount(0);
    });

    await test.step("the page shows both editors' work", async () => {
      await second.reload();
      await expect(block(second, '.canvas-blocks', 'first')).toHaveText(firstText);
      await expect(block(second, '.canvas-blocks', 'second')).toHaveText('second by the second editor');
    });
  } finally {
    await firstContext.close();
  }
}

test.describe('two editors, one page', () => {
  // Only an admin takes over a lock its holder still keeps alive.
  test.use({ storageState: authState('admin') });

  test("the second takes the page over, the first's unsaved work is kept as a draft, and its picks land on the page", async ({ page, browser }) => {
    test.setTimeout(90_000);
    await twoEditors(page, browser, { savedInEditor: true });
  });

  test('on a page the editor has not saved yet, the draft holds only what the first editor changed', async ({ page, browser }) => {
    // An API-written page lacks the attributes the editor gives every block, so
    // it is read as the editor holds it before the diff (EditorCore.heldJSON).
    test.setTimeout(90_000);
    await twoEditors(page, browser, { savedInEditor: false });
  });
});
