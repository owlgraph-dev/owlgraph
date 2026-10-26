// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import type { Page } from '@playwright/test';
import { test, expect } from '$tests/e2e/fixtures';
import { createPage } from '$tests/e2e/api';
import { seed, authState } from '$tests/e2e/seed-data';

function searchDialog(page: Page) {
  return page.getByRole('dialog', { name: 'Search' });
}

async function openViaShortcut(page: Page) {
  const dialog = searchDialog(page);
  await page.keyboard.press('Control+k');
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe('search overlay', () => {
  test.use({ storageState: authState('editorA') });

  test('Ctrl/Cmd-K opens the overlay and focuses the input', async ({ page }) => {
    await page.goto('/');
    const dialog = await openViaShortcut(page);
    await expect(dialog.getByPlaceholder('Search…')).toBeFocused();
  });

  test('Escape closes the overlay', async ({ page }) => {
    await page.goto('/');
    const dialog = await openViaShortcut(page);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('typing a query returns results and Enter navigates to the selected one', async ({ page }) => {
    await page.goto('/');
    const dialog = await openViaShortcut(page);
    await dialog.getByPlaceholder('Search…').fill(seed.publicTitle);

    const result = dialog.getByRole('option').filter({ hasText: seed.publicTitle }).first();
    await expect(result).toBeVisible();

    await page.keyboard.press('Enter');
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(new RegExp(`/${seed.publicSlug}$`));
  });

  test('arrow keys clamp at the list ends (no wraparound)', async ({ page }) => {
    await page.goto('/');
    const dialog = await openViaShortcut(page);
    // "page" matches six seeded titles, all editorA's. Until the debounced search
    // answers, only the "All results" row is listed: wait for two results.
    await dialog.getByPlaceholder('Search…').fill('page');

    const options = dialog.getByRole('option');
    await expect(options.nth(2)).toBeVisible();
    const count = await options.count();

    for (let i = 0; i < count + 3; i++) await page.keyboard.press('ArrowDown');
    await expect(options.nth(count - 1)).toHaveAttribute('data-selected', '');

    for (let i = 0; i < count + 3; i++) await page.keyboard.press('ArrowUp');
    await expect(options.first()).toHaveAttribute('data-selected', '');
  });

  test('Ctrl/Cmd-K opens search from /{slug}/edit (app bar is hidden there)', async ({ page }) => {
    // A page of the test's own: the editor's edit lock outlives the test and
    // would turn away the next spec to open a seeded page's editor.
    const { slug } = await createPage(page.request);
    await page.goto(`/${slug}/edit`);
    await expect(page.getByRole('navigation', { name: 'Primary' })).toHaveCount(0);

    const dialog = await openViaShortcut(page);
    await expect(dialog.getByPlaceholder('Search…')).toBeFocused();

    // Escape closes only the overlay, not the editor underneath.
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(new RegExp(`/${slug}/edit$`));
  });
});
