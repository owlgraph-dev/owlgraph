// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import type { Page, Route } from '@playwright/test';
import { test, expect } from '$tests/e2e/fixtures';
import { authState } from '$tests/e2e/seed-data';
import { editorSelection } from '$tests/e2e/editor';
import { createPage } from '$tests/e2e/api';
import { txt, doc } from '$tests/e2e/doc';
import { db } from '../../../platform/db.server';

test.use({ storageState: authState('admin') });

const FAILED = 'The page could not be saved. Your changes are still here.';

async function storedText(pageId: string): Promise<string> {
  const [row] = await db<{ doc: { content: { content?: { text?: string }[] }[] } }[]>`select doc from pages where id = ${pageId}`;
  return (row.doc.content[0].content ?? []).map((t) => t.text ?? '').join('');
}

/** Confirmed on the editor's own selection (tests/e2e/editor.ts). */
async function caretAtEnd(page: Page) {
  const editor = page.locator('.ProseMirror');
  await expect(async () => {
    await editor.locator('p').first().click();
    await expect(editor).toBeFocused({ timeout: 1000 });
  }).toPass({ timeout: 10000 });
  await expect(async () => {
    await page.keyboard.press('End');
    expect(await editorSelection(editor)).toMatchObject({ text: '', atLineEnd: true });
  }).toPass({ timeout: 10000 });
}

test.describe('a save the server fails', () => {
  test('keeps the edits on screen, and the lasting toast’s Try again saves what the editor holds by then', async ({ page }) => {
    const { id, slug } = await createPage(page.request, { doc: doc({ type: 'paragraph', attrs: { blockId: 'p1' }, content: [txt('Before the failure')] }) });

    let network: 'error' | 'offline' | 'through' = 'error';
    const isSave = (url: string, method: string) => method === 'PUT' && new URL(url).pathname === `/api/pages/${id}`;
    await page.route(`**/api/pages/${id}`, async (route: Route) => {
      if (route.request().method() !== 'PUT' || network === 'through') return route.fallback();
      if (network === 'error') return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'Internal Error' }) });
      return route.abort('internetdisconnected');
    });

    // The page's own clock, so the test moves past a toast's 5 s timeout
    // rather than waiting.
    await page.clock.install();
    await page.goto(`/${slug}/edit`);
    const editor = page.locator('.ProseMirror');
    await expect(editor).toContainText('Before the failure');
    await caretAtEnd(page);
    await page.keyboard.type(' and the first edit');

    const toasts = page.getByRole('region', { name: 'Notifications' });
    const failed = toasts.getByText(FAILED);
    const retry = toasts.getByRole('button', { name: 'Try again', exact: true });

    const answered = page.waitForResponse((r) => isSave(r.url(), r.request().method()));
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    expect((await answered).status()).toBe(500);
    await expect(failed).toBeVisible();
    await expect(retry).toBeVisible();
    await expect(editor).toContainText('Before the failure and the first edit');
    expect(await storedText(id)).toBe('Before the failure');
    await page.clock.runFor(10_000);
    await expect(failed).toBeVisible();

    network = 'offline';
    const dropped = page.waitForEvent('requestfailed', (r) => isSave(r.url(), r.method()));
    await retry.click();
    await dropped;
    await expect(failed).toBeVisible();
    await expect(retry).toBeVisible();
    await expect(editor).toContainText('Before the failure and the first edit');
    expect(await storedText(id)).toBe('Before the failure');

    await caretAtEnd(page);
    await page.keyboard.type(' and the second');
    network = 'through';
    const saved = page.waitForResponse((r) => isSave(r.url(), r.request().method()));
    await retry.click();
    expect((await saved).ok()).toBe(true);
    await expect(failed).toHaveCount(0);
    await expect(page.getByText(/^Saved /)).toBeVisible();
    expect(await storedText(id)).toBe('Before the failure and the first edit and the second');
  });
});
