// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import type { Page } from '@playwright/test';
import { test, expect } from '$tests/e2e/fixtures';
import { authState, seed } from '$tests/e2e/seed-data';

// A device cookie the server renders as data-color-pref on <html>, so the
// first paint is in the chosen scheme (docs/architecture/theming.md).

const LIGHT_BG = 'rgb(251, 251, 250)';
const DARK_BG = 'rgb(23, 23, 22)';
const WHITE = 'rgb(255, 255, 255)';

const shellBg = (page: Page) => page.locator('.page-shell').evaluate((el) => getComputedStyle(el).backgroundColor);
const colorPref = (page: Page) => page.locator('html').getAttribute('data-color-pref');

test.describe('colour preference', () => {
  test.use({ storageState: authState('admin') });

  test('a viewer who never chose follows the device', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto(`/${seed.publicSlug}`);
    expect(await colorPref(page)).toBe('system');
    expect(await shellBg(page)).toBe(DARK_BG);
    await page.emulateMedia({ colorScheme: 'light' });
    await expect.poll(() => shellBg(page)).toBe(LIGHT_BG);
  });

  test('dark is rendered by the server and kept across navigation; the page reads on a light area', async ({ page, baseURL }) => {
    await page.context().addCookies([{ name: 'color_pref', value: 'dark', url: baseURL! }]);

    // The attribute is in the server's HTML, not added after hydration.
    const html = await (await page.request.get(`/${seed.publicSlug}`)).text();
    expect(html).toMatch(/<html[^>]*data-color-pref="dark"/);

    await page.goto(`/${seed.publicSlug}`);
    expect(await shellBg(page)).toBe(DARK_BG);
    const main = page.locator('main.canvas-route');
    await expect(main).toHaveAttribute('data-scheme', 'light');
    // The reading area paints the canvas's own ground, so there is no seam.
    expect(await main.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(WHITE);
    expect(await page.locator('.page-canvas').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(WHITE);

    await page.goto('/settings/profile');
    expect(await colorPref(page)).toBe('dark');
    expect(await shellBg(page)).toBe(DARK_BG);
  });

  test('the Appearance row applies a choice at once and remembers it on this device', async ({ page }) => {
    await page.goto('/settings/profile');
    const appearance = page.getByRole('group', { name: 'Appearance' });
    await expect(appearance.getByRole('radio', { name: 'System' })).toHaveAttribute('data-state', 'on');

    await appearance.getByRole('radio', { name: 'Dark' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-color-pref', 'dark');
    await expect.poll(() => shellBg(page)).toBe(DARK_BG);
    await expect(page.locator('meta[name="theme-color"][media="(prefers-color-scheme: light)"]')).toHaveAttribute('content', '#171716');
    const cookie = (await page.context().cookies()).find((c) => c.name === 'color_pref');
    expect(cookie?.value).toBe('dark');

    await page.reload();
    expect(await colorPref(page)).toBe('dark');
    await expect(page.getByRole('group', { name: 'Appearance' }).getByRole('radio', { name: 'Dark' })).toHaveAttribute('data-state', 'on');
  });

  test('the Appearance row shows the current choice after client-side navigation away and back', async ({ page }) => {
    await page.goto('/settings/profile');
    await page.getByRole('group', { name: 'Appearance' }).getByRole('radio', { name: 'Dark' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-color-pref', 'dark');

    // No reload in between: the root layout's data still holds the preference
    // the page was first loaded with.
    const nav = page.getByRole('navigation', { name: 'Settings sections' });
    await nav.getByRole('link', { name: 'API tokens' }).click();
    await expect(page).toHaveURL(/\/settings\/api-tokens$/);
    await nav.getByRole('link', { name: 'Profile' }).click();
    await expect(page).toHaveURL(/\/settings\/profile$/);

    const appearance = page.getByRole('group', { name: 'Appearance' });
    await expect(appearance.getByRole('radio', { name: 'Dark' })).toHaveAttribute('data-state', 'on');
    await expect(appearance.getByRole('radio', { name: 'Light' })).toHaveAttribute('data-state', 'off');
  });
});
