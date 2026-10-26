// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Cancelling is DeletePageModal.svelte.test.ts's; who may delete is pages.http.test.ts's.
import type { Page } from '@playwright/test';
import { test, expect } from '$tests/e2e/fixtures';
import { createPage } from '$tests/e2e/api';
import { authState } from '$tests/e2e/seed-data';

async function openDeleteMenu(page: Page) {
  // "More actions" labels the menu content, not its trigger.
  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('menuitem', { name: 'Delete page' }).click();
}

function deleteDialog(page: Page) {
  // No name filter: the title changes with the dialog's state, and only one is ever open.
  return page.getByRole('dialog');
}

test.describe('editor (editorA)', () => {
  test.use({ storageState: authState('editorA') });

  test('can delete an owned page via the menu, then it is truly gone', async ({ page }) => {
    const { slug } = await createPage(page.request);
    await page.goto(`/${slug}/edit`);

    await openDeleteMenu(page);
    const dialog = deleteDialog(page);
    await expect(dialog.getByRole('heading', { name: 'Delete this page?' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Delete' }).click();

    await expect(page).toHaveURL(/\/$/);

    const resp = await page.goto(`/${slug}/edit`);
    expect(resp?.status()).toBe(404);
  });
});
