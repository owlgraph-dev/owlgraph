// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import type { Page } from '@playwright/test';
import { test, expect } from '#tests/e2e/fixtures.ts';
import { authState } from '#tests/e2e/seed-data.ts';
import { unique, createPage, createSpace, deleteSpace } from '#tests/e2e/api.ts';

// Only a browser re-resolves the route during hydration, which needs the
// space registry warm (src/hooks.client.ts). What the addresses answer is
// routing.http.test.ts's.

test.describe('space routing', () => {
  test.use({ storageState: authState('admin') });

  // One space per test, so a test failing midway leaves the next intact.
  let ns: { slug: string; id: string } | null = null;

  async function space(page: Page) {
    const { name, slug } = unique('E2E Routing NS');
    ns = { slug, id: await createSpace(page.request, { name, slug }) };
    return ns;
  }

  test.afterEach(async ({ page }) => {
    if (ns) await deleteSpace(page.request, ns.id);
    ns = null;
  });

  test('a read view in a space keeps its Edit affordance stable after real browser hydration', async ({ page }) => {
    const { id: spaceId, slug } = await space(page);
    const created = await createPage(page.request, { spaceId });

    // A wrong client-side re-resolution shows the Edit link, then drops it.
    await page.goto(`/${slug}/${created.slug}`);
    const editLink = page.getByRole('link', { name: 'Edit', exact: true });
    await expect(editLink).toBeVisible();
    // Past hydration: every module loaded and run.
    await page.waitForLoadState('networkidle');
    await expect(editLink).toBeVisible();
  });

  test('an edit view in a space keeps the app bar hidden after real browser hydration', async ({ page }) => {
    const { id: spaceId, slug } = await space(page);
    const created = await createPage(page.request, { spaceId });

    await page.goto(`/${slug}/${created.slug}/edit`);
    const appBar = page.getByRole('navigation', { name: 'Primary' });
    await expect(appBar).toHaveCount(0);
    await page.waitForLoadState('networkidle');
    await expect(appBar).toHaveCount(0);
    await expect(page.locator('.ProseMirror')).toBeVisible();
  });
});
