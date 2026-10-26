// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import type { Page } from '@playwright/test';
import { test, expect } from '$tests/e2e/fixtures';
import { authState } from '$tests/e2e/seed-data';

// Definitions are global state across the run: a random suffix keeps a stale
// row a failed run left behind from colliding.

function uniqueName(base: string) {
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base}${suffix}`;
}

async function openAddDialog(page: Page) {
  const dialog = page.getByRole('dialog');
  await page.getByRole('button', { name: 'Add property' }).click();
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe('semantic schema — properties catalog', () => {
  test.use({ storageState: authState('admin') });

  let created: string | null = null;

  test.afterEach(async ({ page }) => {
    if (!created) return;
    await page.goto('/settings/schema/properties');
    const row = page.locator('tbody tr').filter({ hasText: created });
    if (await row.count()) {
      await row.getByRole('button', { name: 'Delete' }).click();
      await expect(row).toHaveCount(0);
    }
    created = null;
  });

  test('a property is added, edited and deleted through the modal and the row actions', async ({ page }) => {
    const name = uniqueName('e2eprop');
    created = name;
    await page.goto('/settings/schema/properties');

    const dialog = await openAddDialog(page);
    await expect(dialog.getByRole('heading', { name: 'Add property' })).toBeVisible();
    await dialog.getByLabel('Name', { exact: true }).fill(name);
    await dialog.getByRole('textbox', { name: 'Label English', exact: true }).fill('E2E label');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog).toBeHidden();

    const row = page.locator('tbody tr').filter({ hasText: name });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('E2E label');

    await row.getByRole('button', { name: 'Edit' }).click();
    const editDialog = page.getByRole('dialog');
    await expect(editDialog.getByRole('heading', { name: 'Update property' })).toBeVisible();
    await expect(editDialog.getByLabel('Name', { exact: true })).toHaveValue(name);
    await editDialog.getByRole('textbox', { name: 'Label English', exact: true }).fill('E2E label edited');
    await editDialog.getByRole('button', { name: 'Save' }).click();
    await expect(editDialog).toBeHidden();
    await expect(row).toContainText('E2E label edited');

    await row.getByRole('button', { name: 'Delete' }).click();
    await expect(row).toHaveCount(0);
    created = null;
  });
});
