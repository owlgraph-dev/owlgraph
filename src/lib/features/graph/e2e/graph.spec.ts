// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { test, expect } from '$tests/e2e/fixtures';
import { seed, authState } from '$tests/e2e/seed-data';
import { horizontalOverflow, touchTargets } from '$tests/e2e/responsive';

// Each node is an SVG <g role="button" aria-label={title}>.
const graphButton = (page: import('@playwright/test').Page, title: string) =>
  page.locator('svg.graph').getByRole('button', { name: title });

test("the sidebar follows the reader's scheme, not the page's", async ({ browser, baseURL }) => {
  // The panel is app chrome, not page: on a page pinned light, a reader in dark gets a dark panel.
  const ctx = await browser.newContext({ storageState: authState('admin') });
  await ctx.addCookies([{ name: 'color_pref', value: 'dark', url: baseURL! }]);
  const page = await ctx.newPage();
  await page.goto(`/${seed.graphPageSlug}`);
  const sidebar = page.locator('.lg-panel');
  await page.locator('.ust-tab').click();
  await expect(sidebar).toBeVisible();

  const shellGround = await page.locator('.page-shell').evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(await sidebar.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(shellGround);
  // The page it sits beside stays light, pinned by its own content scheme.
  expect(await page.locator('.page-canvas').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(255, 255, 255)');
  await ctx.close();
});

for (const width of [360, 390]) {
  test.describe(`the graph's settings on a phone ${width}px wide`, () => {
    test.use({ storageState: authState('admin'), viewport: { width, height: 800 } });

    const sheet = (page: import('@playwright/test').Page) => page.getByRole('dialog', { name: 'Display options' });
    const openSheet = async (page: import('@playwright/test').Page) => {
      await page.getByRole('button', { name: 'Display options', exact: true }).click();
      await expect(sheet(page)).toBeVisible();
      // The sheet slides up: measure it once it has arrived.
      await sheet(page).evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
    };
    const section = (page: import('@playwright/test').Page, name: string) => sheet(page).getByRole('button', { name, exact: true });

    test('open the sheet, reach the forces at its end, and close it by its header, Esc or the backdrop', async ({ page }) => {
      await page.goto('/graph');
      await expect(graphButton(page, 'Graph Test Page')).toBeVisible();
      await openSheet(page);

      await expect(section(page, 'View')).toHaveAttribute('aria-expanded', 'true');
      await expect(section(page, 'Filter')).toHaveAttribute('aria-expanded', 'true');
      await expect(section(page, 'Display')).toHaveAttribute('aria-expanded', 'false');
      await expect(section(page, 'Forces')).toHaveAttribute('aria-expanded', 'false');
      await expect(sheet(page).getByRole('group', { name: 'Layout mode' })).toBeVisible();

      const box = (await sheet(page).boundingBox())!;
      expect(box.y, 'a strip of backdrop stays above the sheet').toBeGreaterThanOrEqual(50);
      expect(box.y + box.height).toBeLessThanOrEqual(800 + 1);

      await section(page, 'Display').click();
      await section(page, 'Forces').click();
      const last = sheet(page).getByRole('slider', { name: 'Link distance' });
      await last.scrollIntoViewIfNeeded();
      await expect(last).toBeInViewport();
      await expect(sheet(page).getByRole('button', { name: 'Close', exact: true })).toBeInViewport();
      const before = await last.getAttribute('aria-valuenow');
      await last.focus();
      await page.keyboard.press('ArrowRight');
      await expect(last).not.toHaveAttribute('aria-valuenow', before ?? '');

      await sheet(page).getByRole('button', { name: 'Close', exact: true }).click();
      await expect(sheet(page)).toBeHidden();

      // Reopened, the sections are as they were left.
      await openSheet(page);
      await expect(section(page, 'Forces')).toHaveAttribute('aria-expanded', 'true');
      await page.keyboard.press('Escape');
      await expect(sheet(page)).toBeHidden();

      // The backdrop strip above the sheet.
      await openSheet(page);
      await page.mouse.click(width / 2, 10);
      await expect(sheet(page)).toBeHidden();
    });

    test('a filter set in the sheet applies at once, counted in its header and visible when it closes', async ({ page }) => {
      await page.goto('/graph');
      await expect(graphButton(page, 'Graph Test Page')).toBeVisible();
      await openSheet(page);
      await sheet(page).getByRole('combobox', { name: 'Type', exact: true }).click();
      await page.getByRole('option', { name: 'Document', exact: true }).click();
      await page.keyboard.press('Escape'); // closes the picker's list, not the sheet
      await expect(sheet(page)).toBeVisible();
      await expect(sheet(page).getByText('Filter · 1', { exact: true })).toBeVisible();

      await sheet(page).getByRole('button', { name: 'Close', exact: true }).click();
      await expect(sheet(page)).toBeHidden();
      await expect(graphButton(page, 'Graph Test Page')).toHaveCount(0);
      await expect(graphButton(page, 'Public Document')).toBeVisible();
      await expect(page.locator('.graph-stats.filtered')).toBeVisible();
    });
  });
}

test.describe("the graph's settings on a phone, by touch", () => {
  test.use({ storageState: authState('admin'), viewport: { width: 390, height: 800 }, hasTouch: true });

  test('every control in the open sheet is finger-sized, its pickers take 16px text, and nothing overflows', async ({ page }) => {
    await page.goto('/graph');
    await page.getByRole('button', { name: 'Display options', exact: true }).tap();
    const sheet = page.getByRole('dialog', { name: 'Display options' });
    await expect(sheet).toBeVisible();
    for (const name of ['Display', 'Forces']) await sheet.getByRole('button', { name, exact: true }).tap();
    await expect.poll(() => touchTargets(page, '[role="dialog"]')).toEqual([]);
    await expect.poll(() => horizontalOverflow(page)).toEqual([]);
    expect(await sheet.getByRole('combobox', { name: 'Type', exact: true }).evaluate((el) => getComputedStyle(el).fontSize)).toBe('16px');
  });
});

test.describe("the graph's settings on a wide window", () => {
  test.use({ storageState: authState('admin') });

  test('the toggle opens the floating panel beside the graph, not a sheet', async ({ page }) => {
    await page.goto('/graph');
    await page.getByRole('button', { name: 'Display options', exact: true }).click();
    await expect(page.getByRole('group', { name: 'Display options' })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});
