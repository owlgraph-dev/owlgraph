// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import type { Page } from '@playwright/test';
import { test, expect } from '$tests/e2e/fixtures';
import { authState } from '$tests/e2e/seed-data';
import { unique, createPage, createNamespace, deleteNamespace } from '$tests/e2e/api';

// Only a browser re-resolves the route during hydration, which needs the
// namespace registry warm (src/hooks.client.ts). What the addresses answer is
// routing.http.test.ts's.

test.describe('namespace routing', () => {
  test.use({ storageState: authState('admin') });

  // One namespace per test, so a test failing midway leaves the next intact.
  let ns: { slug: string; id: string } | null = null;

  async function namespace(page: Page) {
    const { name, slug } = unique('E2E Routing NS');
    ns = { slug, id: await createNamespace(page.request, { name, slug }) };
    return ns;
  }

  test.afterEach(async ({ page }) => {
    if (ns) await deleteNamespace(page.request, ns.id);
    ns = null;
  });

  test('a namespaced read view keeps its Edit affordance stable after real browser hydration', async ({ page }) => {
    const { id: namespaceId, slug } = await namespace(page);
    const created = await createPage(page.request, { namespaceId });

    // A wrong client-side re-resolution shows the Edit link, then drops it.
    await page.goto(`/${slug}/${created.slug}`);
    const editLink = page.getByRole('link', { name: 'Edit', exact: true });
    await expect(editLink).toBeVisible();
    // Past hydration: every module loaded and run.
    await page.waitForLoadState('networkidle');
    await expect(editLink).toBeVisible();
  });

  test('a namespaced edit view keeps the app bar hidden after real browser hydration', async ({ page }) => {
    const { id: namespaceId, slug } = await namespace(page);
    const created = await createPage(page.request, { namespaceId });

    await page.goto(`/${slug}/${created.slug}/edit`);
    const appBar = page.getByRole('navigation', { name: 'Primary' });
    await expect(appBar).toHaveCount(0);
    await page.waitForLoadState('networkidle');
    await expect(appBar).toHaveCount(0);
    await expect(page.locator('.ProseMirror')).toBeVisible();
  });
});
