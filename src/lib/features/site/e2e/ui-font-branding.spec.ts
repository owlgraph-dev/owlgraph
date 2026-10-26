// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import type { Page } from '@playwright/test';
import { test, expect } from '$tests/e2e/fixtures';
import { createPage, formAction } from '$tests/e2e/api';
import { authState } from '$tests/e2e/seed-data';

// The interface font restyles every page's chrome: the test runs alone
// (tests/e2e/fixtures.ts).
test.use({ siteWide: true });

// The Interface font repoints --ds-font-sans, the chrome's font, independently
// of the content's typography.

async function setUiFont(page: Page, family: string): Promise<void> {
  expect((await formAction(page.request, '/settings/branding?/setUiFont', { family })).type).toBe('success');
}

test.describe('UI font branding (admin)', () => {
  test.use({ storageState: authState('admin') });

  test.afterEach(async ({ page }) => {
    // A global setting shared across the suite: reset whatever the test did.
    await setUiFont(page, '');
  });

  test('setting the Interface font rebrands the UI only, not content; clearing it reverts', async ({ page }) => {
    await setUiFont(page, 'serif');

    await page.goto('/settings/branding');
    const uiFont = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ds-font-sans'));
    expect(uiFont).toContain('ui-serif');
    // The design-system Select's trigger is a combobox named by its aria-label.
    await expect(page.getByRole('combobox', { name: 'Interface' })).toHaveText(/Serif/);

    const computedFont = await page.getByRole('navigation', { name: 'Settings sections' }).getByRole('link').first().evaluate((el) => getComputedStyle(el).fontFamily);
    expect(computedFont).toContain('ui-serif');

    const { slug } = await createPage(page.request);
    await page.goto(`/${slug}`);
    const contentFont = await page.locator('.page-canvas').first().evaluate((el) => getComputedStyle(el).fontFamily);
    expect(contentFont).not.toContain('ui-serif');

    await setUiFont(page, '');
    await page.goto('/settings/branding');
    const revertedFont = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ds-font-sans'));
    expect(revertedFont).not.toContain('ui-serif');
    expect(revertedFont).toContain('ui-sans-serif');
    await expect(page.getByRole('combobox', { name: 'Interface' })).toHaveText(/Unbranded/);
  });
});
