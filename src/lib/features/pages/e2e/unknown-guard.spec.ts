// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The guard's other writers are pages.http.test.ts's and pages.int.test.ts's.
// The kinds are invented: a plugin merely turned off keeps its kinds known.
import type { APIRequestContext, Page } from '@playwright/test';
import { test, expect } from '$tests/e2e/fixtures';
import { createPage } from '$tests/e2e/api';
import { authState } from '$tests/e2e/seed-data';
import { db } from '../../../platform/db.server';
import { retiredWidget, textPara } from '$tests/e2e/doc';
import { storedDoc } from '$tests/support/storedDoc';

test.use({ storageState: authState('admin') });

type Node = { type: string; attrs?: Record<string, unknown>; content?: Node[]; text?: string };

/** An unknown block at the top level and one in the first cell of a grid. */
async function guardedPage(request: APIRequestContext) {
  const { id, slug } = await createPage(request);
  const grid: Node = {
    type: 'grid',
    attrs: { blockId: 'grid-1', columnWidths: [1, 1] },
    content: [
      { type: 'gridCell', content: [textPara('p-left', 'Left column'), retiredWidget('w-cell')] },
      { type: 'gridCell', content: [textPara('p-right', 'Right column')] },
    ],
  };
  const doc = { type: 'doc', content: [textPara('p-first', 'First paragraph'), retiredWidget('w-top'), grid] };
  expect((await request.put(`/api/pages/${id}`, { data: doc })).ok()).toBe(true);
  return { id, slug };
}

const holds = (doc: unknown, text: string) => JSON.stringify(doc).includes(text);

async function clickSave(page: Page, pageId: string) {
  const answered = page.waitForResponse((r) => r.request().method() === 'PUT' && new URL(r.url()).pathname === `/api/pages/${pageId}`);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  return await answered;
}

test.describe('the unknown-block guard', () => {

  test('lets the editor remove what its author deleted, and stops a save that would lose one it never showed', async ({ page }) => {
    const { id, slug } = await guardedPage(page.request);
    await page.goto(`/${slug}/edit`);
    const editor = page.locator('.ProseMirror');
    const inCell = editor.locator('[data-block-id="w-cell"]');
    await inCell.click();
    await page.getByRole('toolbar', { name: 'Block tools' }).getByRole('button', { name: 'Delete block' }).click();
    await expect(inCell).toHaveCount(0);
    expect((await clickSave(page, id)).ok()).toBe(true);
    expect(holds(await storedDoc(id), '"w-cell"')).toBe(false);
    expect(holds(await storedDoc(id), '"w-top"')).toBe(true);

    // Meanwhile the stored page gains one this editor never showed.
    const now = await storedDoc(id);
    await db`update pages set doc = ${db.json(JSON.parse(JSON.stringify({ ...now, content: [...now.content, retiredWidget('w-late')] })))} where id = ${id}`;
    await editor.getByText('First paragraph').click();
    await page.keyboard.press('End');
    await page.keyboard.type(' (edited)');
    expect((await clickSave(page, id)).status()).toBe(409);
    await expect(page.locator('.ds-toaster-live[aria-live="assertive"]')).toHaveText(/can’t show/);
    await expect(page.locator('.ds-toaster').getByRole('button', { name: 'Try again' })).toHaveCount(0);
    const after = await storedDoc(id);
    expect(holds(after, '"w-late"')).toBe(true);
    expect(holds(after, '(edited)')).toBe(false);
  });
});
