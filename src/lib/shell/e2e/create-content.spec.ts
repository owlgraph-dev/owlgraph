// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import type { Page } from '@playwright/test';
import { test, expect } from '$tests/e2e/fixtures';
import { authState } from '$tests/e2e/seed-data';

function appbar(page: Page) {
  return page.getByRole('navigation', { name: 'Primary' });
}

async function openCreateModal(page: Page) {
  const dialog = page.getByRole('dialog', { name: 'Create' });
  await appbar(page).getByRole('button', { name: 'Create' }).click();
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe('page creation flow', () => {
  test.use({ storageState: authState('editorA') });

  test('Create → Page creates a blank page that inherits its namespace and opens the editor', async ({ page }) => {
    await page.goto('/');
    const dialog = await openCreateModal(page);
    await dialog.getByRole('button', { name: 'Page' }).click();

    await expect(page).toHaveURL(/\/edit$/);
    // A click-to-edit title: its labelled input mounts only once clicked.
    await page.getByRole('button', { name: 'Untitled', exact: true }).click();
    await expect(page.getByLabel('Page title')).toHaveValue('Untitled');
    await page.getByRole('button', { name: 'Access control' }).click();
    // A new page follows its namespace; the test database's default one is public.
    await expect(page.getByRole('combobox', { name: 'Who can view this page' })).toHaveText(/^Same as namespace \(public/);
  });
});

test.describe('document creation flow', () => {
  test.use({ storageState: authState('editorA') });

  test('Create → Document uploads a file and opens the document editor', async ({ page }) => {
    await page.goto('/');
    const dialog = await openCreateModal(page);
    await dialog.getByRole('button', { name: 'Document' }).click();
    await expect(dialog.getByRole('heading', { name: 'Add a document' })).toBeVisible();

    const title = `E2E Doc ${Date.now()}`;
    await dialog
      .getByLabel('File (PDF, .txt, .md)')
      .setInputFiles({ name: 'note.md', mimeType: 'text/markdown', buffer: Buffer.from('# Hi\n\nBody.') });
    await dialog.getByLabel('Title').fill(title);
    await dialog.getByRole('button', { name: 'Upload' }).click();

    await expect(page).toHaveURL(/\/edit$/);
    await expect(page.getByRole('button', { name: title, exact: true })).toBeVisible();
  });
});

test.describe('phone viewport placement', () => {
  test.use({ storageState: authState('editorA'), viewport: { width: 375, height: 667 } });

  test('Create is hidden from the bottom bar and reachable via the menu sheet', async ({ page }) => {
    await page.goto('/');
    await expect(appbar(page).getByRole('button', { name: 'Create' })).toBeHidden();

    const menu = page.getByRole('dialog', { name: 'Menu' });
    await appbar(page).getByRole('button', { name: 'Menu' }).click();
    await expect(menu).toBeVisible();

    const menuCreate = menu.getByRole('button', { name: 'Create' });
    await expect(menuCreate).toBeVisible();
    await menuCreate.click();

    await expect(page.getByRole('dialog', { name: 'Create' })).toBeVisible();
  });
});
