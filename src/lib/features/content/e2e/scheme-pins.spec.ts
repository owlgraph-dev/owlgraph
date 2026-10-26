// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import type { Locator } from '@playwright/test';
import { test, expect } from '$tests/e2e/fixtures';
import { authState } from '$tests/e2e/seed-data';
import { createPage } from '$tests/e2e/api';
import { doc } from '$tests/e2e/doc';
import { blockSettings } from '$tests/e2e/editor';

const LIGHT_GROUND = 'rgb(255, 255, 255)';
const DARK_GROUND = 'rgb(28, 28, 27)';

const bg = (locator: Locator) => locator.evaluate((el) => getComputedStyle(el).backgroundColor);

test.describe('scheme pins', () => {
  test.use({ storageState: authState('admin') });

  test('an HTML block pinned light shows on the light page ground for a dark reader, in the editor too', async ({ page, baseURL }) => {
    const { slug } = await createPage(page.request, {
      doc: doc(
        { type: 'htmlBlock', attrs: { html: '<p style="color: #334155">Slate on white</p>', scheme: 'light' } },
        { type: 'htmlBlock', attrs: { html: '<p>Follows the page</p>' } }
      ),
      contentScheme: 'adaptive',
    });
    await page.context().addCookies([{ name: 'color_pref', value: 'dark', url: baseURL! }]);

    await page.goto(`/${slug}`);
    const pinned = page.locator('.html-block', { hasText: 'Slate on white' });
    await expect(pinned).toHaveAttribute('data-scheme', 'light');
    expect(await bg(pinned)).toBe(LIGHT_GROUND);
    // The unpinned block is wrapped like every HTML block (html/render.ts) — with no pin of its own.
    const following = page.locator('.html-block', { hasText: 'Follows the page' });
    await expect(following).toHaveCount(1);
    await expect(following).not.toHaveAttribute('data-scheme', /./);

    await page.goto(`/${slug}/edit`);
    const edited = page.locator('.editor .html-block', { hasText: 'Slate on white' });
    await expect(edited).toHaveAttribute('data-scheme', 'light');
    expect(await bg(edited)).toBe(LIGHT_GROUND);
  });

  test('the block settings panel pins an HTML block', async ({ page }) => {
    const { slug } = await createPage(page.request, {
      doc: doc({ type: 'htmlBlock', attrs: { html: '<p style="color: #334155">Pin me</p>' } }),
      contentScheme: 'adaptive',
    });
    await page.goto(`/${slug}/edit`);
    const block = page.locator('.editor .html-block', { hasText: 'Pin me' });
    const scheme = blockSettings(page).getByRole('group', { name: 'Colour scheme' }).last();
    await block.click();
    await expect(scheme).toBeVisible();
    await scheme.getByRole('radio', { name: 'Dark' }).click();
    await expect(page.locator('.editor .html-block', { hasText: 'Pin me' })).toHaveAttribute('data-scheme', 'dark');
  });

  test("an image backdrop paints the pinned scheme's page ground behind the image", async ({ page, baseURL }) => {
    const { slug } = await createPage(page.request, {
      doc: doc(
        { type: 'image', attrs: { assetId: '00000000-0000-0000-0000-000000000000', alt: 'Dark backdrop', backdrop: 'dark' } },
        { type: 'image', attrs: { assetId: '00000000-0000-0000-0000-000000000000', alt: 'No backdrop' } }
      ),
      contentScheme: 'adaptive',
    });
    await page.context().addCookies([{ name: 'color_pref', value: 'light', url: baseURL! }]);

    await page.goto(`/${slug}`);
    expect(await bg(page.getByAltText('Dark backdrop'))).toBe(DARK_GROUND);
    expect(await bg(page.getByAltText('No backdrop'))).toBe('rgba(0, 0, 0, 0)');

    await page.goto(`/${slug}/edit`);
    const edited = page.locator('.editor img[alt="Dark backdrop"]');
    await expect(edited).toHaveAttribute('data-scheme', 'dark');
    expect(await bg(edited)).toBe(DARK_GROUND);
  });
});
