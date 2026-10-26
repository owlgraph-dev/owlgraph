// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import type { Locator, Page } from '@playwright/test';
import { test, expect } from '../fixtures';
import { authState } from '../seed-data';
import { createPage, unique } from '../api';
import { doc, para } from '../doc';
import { db } from '../../../src/lib/platform/db.server';
import { posting } from '../api';
import { blockSettings } from '$tests/e2e/editor';

/** Where the editor's own caret is (tests/e2e/editor.ts): the nodes it sits in, each with its index in its parent (`gridCell#2`). */
function caretSteps(editor: Locator): Promise<string[]> {
  return editor.evaluate((el) => {
    type Node = { type: { name: string } };
    type Resolved = { depth: number; node(d: number): Node; index(d: number): number };
    const { $from } = (el as unknown as { editor: { state: { selection: { $from: Resolved } } } }).editor.state.selection;
    const steps: string[] = [];
    for (let d = 1; d <= $from.depth; d++) steps.push(`${$from.node(d).type.name}#${$from.index(d - 1)}`);
    return steps;
  });
}

/**
 * Selects the page from a click into a block, stepping up with Escape: a deep
 * chain folds its upper levels, so the Page crumb shows only near the top.
 */
async function selectPage(page: Page, blockText: string) {
  const crumb = page.getByRole('navigation', { name: 'Block ancestry' }).getByRole('button', { name: 'Page', exact: true });
  await page.locator('.ProseMirror').getByText(blockText, { exact: true }).click();
  await expect(async () => {
    if (!(await crumb.count()) || (await crumb.getAttribute('aria-current')) !== 'true') await page.keyboard.press('Escape');
    await expect(crumb).toHaveAttribute('aria-current', 'true', { timeout: 1000 });
  }).toPass({ timeout: 10_000 });
}

/** Saves the editor's page and waits until the server has it. */
async function save(page: Page, pageId: string) {
  const saved = page.waitForResponse((r) => r.request().method() === 'PUT' && new URL(r.url()).pathname === `/api/pages/${pageId}`);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  expect((await saved).ok()).toBe(true);
  await expect(page.getByText(/^Saved /)).toBeVisible();
}

const picker = (page: Page) => blockSettings(page).getByRole('combobox', { name: 'Page layout' });
const cells = (page: Page) => page.locator('.page-section').first().locator('.grid-cell');
const ASIDE = 'Written into the third column.';

test.describe("a page layout's life", () => {
  // No site-wide lock: the layout is the test's own, and no other test reads
  // the whole registry.
  test.use({ storageState: authState('editorA'), viewport: { width: 1280, height: 900 } });

  test('an admin makes a page layout, an editor converts a page with it, the admin edits it, the editor applies it again, and switched off and deleted it leaves the page as it was', async ({ page: editor, browser }) => {
    test.setTimeout(150_000);
    const { name: layout } = unique('Journey columns');
    const { id: pageId, slug } = await createPage(editor.request, { doc: doc(para('one'), para('two')) });
    const admin = await (await browser.newContext({ storageState: authState('admin'), viewport: { width: 1280, height: 900 } })).newPage();
    const row = admin.getByRole('row').filter({ hasText: layout });
    const panel = blockSettings(editor);

    try {
      await test.step('an admin makes a three-column page layout', async () => {
        await admin.goto('/settings/page-layouts');
        await admin.getByRole('button', { name: 'New page layout' }).click();
        const dialog = admin.getByRole('dialog', { name: 'New page layout' });
        await dialog.getByRole('textbox', { name: 'Name English', exact: true }).fill(layout);
        const desktop = dialog.getByRole('spinbutton', { name: 'Number of columns (Desktop)' });
        await desktop.fill('3');
        await desktop.press('Tab');
        await posting(admin, 'createPreset', () => dialog.getByRole('button', { name: 'Save' }).click());
        await expect(dialog).toBeHidden();
        await expect(row).toBeVisible();
        await expect(row.getByRole('switch', { name: `Offer “${layout}” to authors` })).toHaveAttribute('aria-checked', 'true');
      });

      await test.step('an editor converts a flow page with it, writes into its third column and saves', async () => {
        await editor.goto(`/${slug}/edit`);
        await selectPage(editor, 'one');
        await picker(editor).click();
        await editor.getByRole('option', { name: layout }).click();
        await editor.getByRole('dialog', { name: 'Convert into sections?' }).getByRole('button', { name: 'Convert' }).click();
        await expect(cells(editor)).toHaveCount(3);
        await expect(cells(editor).first()).toContainText('one');
        await expect(cells(editor).first()).toContainText('two');

        // The third column is empty: its placeholder becomes a paragraph once typed into.
        const canvas = editor.locator('.ProseMirror');
        await expect(async () => {
          const box = (await cells(editor).nth(2).locator('.ph-content').boundingBox())!;
          await editor.mouse.click(box.x + 20, box.y + box.height / 2);
          expect((await caretSteps(canvas)).slice(-2)).toEqual(['gridCell#2', 'placeholder#0']);
        }).toPass({ timeout: 10_000 });
        await editor.keyboard.type(ASIDE);
        await expect(cells(editor).nth(2).locator('p')).toHaveText(ASIDE);

        await selectPage(editor, 'one');
        await expect(picker(editor)).toContainText(layout);
        await save(editor, pageId);
      });

      await test.step('the admin takes the layout down to two columns: the page stays as it was, and its editor shows it customised', async () => {
        await row.getByRole('button', { name: 'Edit page layout' }).click();
        const dialog = admin.getByRole('dialog', { name: 'Edit page layout' });
        const desktop = dialog.getByRole('spinbutton', { name: 'Number of columns (Desktop)' });
        await desktop.fill('2');
        await desktop.press('Tab');
        await posting(admin, 'updatePreset', () => dialog.getByRole('button', { name: 'Save' }).click());
        await expect(dialog).toBeHidden();

        await editor.goto(`/${slug}`);
        await expect(cells(editor)).toHaveCount(3);
        await expect(cells(editor).nth(2)).toHaveText(ASIDE);

        await editor.goto(`/${slug}/edit`);
        await expect(cells(editor)).toHaveCount(3);
        await selectPage(editor, 'one');
        await expect(picker(editor)).toContainText(layout);
        await expect(panel.getByText('customized')).toBeVisible();
      });

      await test.step('the editor applies the layout again, hears what merged, and saves', async () => {
        await panel.getByRole('button', { name: 'Apply the layout again' }).click();
        await expect(cells(editor)).toHaveCount(2);
        // The toast, not the live region that announces it a moment later with the same words.
        await expect(editor.getByRole('region', { name: 'Notifications' }).getByText('Content from column 3 was merged into column 2 (1 sections).')).toBeVisible();
        await expect(cells(editor).nth(1)).toContainText(ASIDE);
        await expect(panel.getByText('customized')).toHaveCount(0);
        await save(editor, pageId);

        await editor.goto(`/${slug}`);
        await expect(cells(editor)).toHaveCount(2);
        await expect(cells(editor).nth(1)).toHaveText(ASIDE);
      });

      await test.step('the admin switches the layout off: the editor no longer offers it, and the page reads Custom', async () => {
        const offered = row.getByRole('switch', { name: `Offer “${layout}” to authors` });
        await posting(admin, 'togglePreset', () => offered.click());
        await expect(offered).toHaveAttribute('aria-checked', 'false');

        await editor.goto(`/${slug}/edit`);
        await expect(cells(editor)).toHaveCount(2);
        await selectPage(editor, 'one');
        await expect(picker(editor)).toContainText('Custom');
        await picker(editor).click();
        await expect(editor.getByRole('option', { name: 'Custom' })).toBeVisible();
        await expect(editor.getByRole('option', { name: layout })).toHaveCount(0);
        await editor.keyboard.press('Escape');
      });

      await test.step('the admin deletes it, and the page keeps its columns and its content', async () => {
        await row.getByRole('button', { name: 'Delete page layout' }).click();
        const confirm = admin.getByRole('dialog', { name: 'Delete this page layout?' });
        await posting(admin, 'deletePreset', () => confirm.getByRole('button', { name: 'Delete page layout' }).click());
        await expect(row).toHaveCount(0);

        await editor.goto(`/${slug}`);
        await expect(cells(editor)).toHaveCount(2);
        await expect(cells(editor).first()).toContainText('one');
        await expect(cells(editor).first()).toContainText('two');
        await expect(cells(editor).nth(1)).toHaveText(ASIDE);

        await editor.goto(`/${slug}/edit`);
        await expect(cells(editor)).toHaveCount(2);
        await selectPage(editor, 'one');
        await expect(picker(editor)).toContainText('Custom');
        await expect(panel.getByText('customized')).toHaveCount(0);
      });
    } finally {
      await admin.context().close();
      // Through the database, so a test that fails halfway leaves no layout in the editor's picker.
      await db`delete from page_layout_presets where scope_kind = 'site' and label ->> 'en' = ${layout}`;
    }
  });
});
