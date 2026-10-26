// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import type { BrowserContext, Page } from '@playwright/test';
import { test, expect } from '$tests/e2e/fixtures';
import { authState } from '$tests/e2e/seed-data';
import { createPage } from '$tests/e2e/api';
import { doc, para } from '$tests/e2e/doc';

// editTabs.ts: the "taken over" reconcile shows only when a tab held unsaved work.

async function openEditor(context: BrowserContext, slug: string): Promise<Page> {
  const tab = await context.newPage();
  await tab.goto(`/${slug}/edit`);
  return tab;
}

const editing = (tab: Page) => expect(tab.locator('.ProseMirror[contenteditable="true"]')).toBeVisible();

test.describe('editing a page in two tabs', () => {
  test.use({ storageState: authState('admin') });

  test('the second tab asks, and the first steps aside without a reconcile', async ({ page, context }) => {
    const { slug } = await createPage(page.request, { doc: doc(para('first')) });
    const a = await openEditor(context, slug);
    await editing(a);

    const b = await openEditor(context, slug);
    await expect(b.getByRole('heading', { name: 'Already open in another tab' })).toBeVisible();
    await b.getByRole('button', { name: 'Edit here', exact: true }).click();
    await editing(b);

    await expect(a.getByRole('heading', { name: 'Editing continues in another tab' })).toBeVisible();
    await expect(a.getByText('Your edit lock was taken over')).toHaveCount(0);

    // Back in the first tab, it takes the lock without asking again.
    await a.getByRole('button', { name: 'Edit here', exact: true }).click();
    await editing(a);
    await expect(b.getByRole('heading', { name: 'Editing continues in another tab' })).toBeVisible();
  });

  test('a tab with unsaved work keeps it, as a draft to reconcile', async ({ page, context }) => {
    const { slug } = await createPage(page.request, { doc: doc(para('first')) });
    const a = await openEditor(context, slug);
    await editing(a);
    await a.locator('.ProseMirror p').first().click();
    await a.keyboard.press('End');
    await a.keyboard.type(' unsaved');
    await expect(a.locator('.ProseMirror')).toContainText('first unsaved');

    const b = await openEditor(context, slug);
    await b.getByRole('button', { name: 'Edit here', exact: true }).click();
    await editing(b);

    await expect(a.getByRole('heading', { name: 'Editing continues in another tab' })).toBeVisible();
    await expect(a.getByText('Your unsaved work has been saved as a draft')).toBeVisible();
  });
});
