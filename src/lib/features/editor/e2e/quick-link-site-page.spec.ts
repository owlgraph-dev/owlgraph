// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { test, expect } from '$tests/e2e/fixtures';
import { authState } from '$tests/e2e/seed-data';
import { createPage, patchPage } from '$tests/e2e/api';

// docs/architecture/blocks/node-embeds.md, "Quick link targets".

test.describe('a quick link to a page of the site', () => {
  test.use({ storageState: authState('editorA') });

  test('the picker offers the search page and a typed path; the public card opens it in the same tab', async ({ page }) => {
    const { id, slug } = await createPage(page.request);
    // German content under an English interface: the card's label is content.
    await patchPage(page.request, id, { locale: 'de', visibility: 'internal' });
    await page.goto(`/${slug}/edit`);
    await page.locator('.ProseMirror').click();

    const insertQuickLink = async () => {
      await page.getByRole('button', { name: 'Insert', exact: true }).click();
      await page.getByRole('menuitem', { name: 'Quick link' }).click();
    };
    const picker = page.getByPlaceholder('Search pages & documents… or paste a URL or /path');

    await insertQuickLink();
    await expect(picker).toBeVisible();
    await picker.fill('search');
    const site = page.getByRole('option').filter({ hasText: '/search' });
    await expect(site).toContainText('Site');
    await expect(site).toContainText('Search');
    await site.click();
    const cards = page.locator('.ProseMirror a.quick-link');
    await expect(cards.filter({ hasText: 'Suche' })).toHaveAttribute('href', '/search');

    await insertQuickLink();
    await expect(picker).toBeVisible();
    await picker.fill('/search?view=grid');
    await page.getByRole('option', { name: 'Link to /search?view=grid' }).click();
    await expect(cards.filter({ hasText: '/search?view=grid' })).toHaveAttribute('href', '/search?view=grid');

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Saved')).toBeVisible({ timeout: 15000 });

    await page.goto(`/${slug}`);
    const link = page.locator('.canvas-blocks a.quick-link', { hasText: 'Suche' });
    await expect(link).toHaveAttribute('href', '/search');
    await expect(link).not.toHaveAttribute('target');
    await expect(page.locator('.canvas-blocks a.quick-link', { hasText: '/search?view=grid' })).not.toHaveAttribute('target');
    await link.click();
    await expect(page).toHaveURL(/\/search$/);
    expect(page.context().pages()).toHaveLength(1);
  });
});
