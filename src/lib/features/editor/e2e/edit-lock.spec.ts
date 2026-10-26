// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { test, expect } from '$tests/e2e/fixtures';
import { authState } from '$tests/e2e/seed-data';
import { createPage, unique } from '$tests/e2e/api';
import { doc, para } from '$tests/e2e/doc';
import { db } from '$lib/platform/db.server';

// A slug rename moves the editor with a client-side navigation, which must
// keep the lock and its heartbeat (docs/architecture/authorization.md, "Edit lock").

test.describe('the edit lock', () => {
  test.use({ storageState: authState('editorA') });

  test("stays with the editor when it moves to the page's new address after a slug rename", async ({ page, browser }) => {
    const { id, slug } = await createPage(page.request, { doc: doc(para('Kept locked.')) });
    const renamed = unique('locked-renamed').slug;
    await page.goto(`/${slug}/edit`);
    await expect(page.locator('.ProseMirror[contenteditable="true"]')).toBeVisible();

    await page.getByRole('button', { name: new RegExp(slug) }).click();
    const field = page.getByRole('textbox', { name: 'Page URL slug' });
    await field.fill(renamed);
    const saved = page.waitForResponse((r) => r.request().method() === 'PATCH' && new URL(r.url()).pathname === `/api/pages/${id}`);
    await field.press('Enter');
    expect((await saved).ok()).toBe(true);
    await page.waitForURL((url) => url.pathname === `/${renamed}/edit`);
    await expect(page.locator('.ProseMirror[contenteditable="true"]')).toBeVisible();

    const locks = await db<{ n: number }[]>`select count(*)::int as n from page_locks where page_id = ${id}`;
    expect(locks[0].n).toBe(1);
    const other = await browser.newContext({ storageState: authState('admin') });
    try {
      const second = await other.newPage();
      await second.goto(`/${renamed}/edit`);
      await expect(second.getByRole('heading', { name: 'Page is being edited' })).toBeVisible();
    } finally {
      await other.close();
    }
  });
});
