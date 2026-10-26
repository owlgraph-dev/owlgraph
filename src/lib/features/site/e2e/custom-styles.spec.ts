// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import type { Page } from '@playwright/test';
import { test, expect } from '$tests/e2e/fixtures';
import { formAction } from '$tests/e2e/api';
import { seed, authState } from '$tests/e2e/seed-data';
import { db } from '../../../platform/db.server';

const SHEET = 'E2E stylesheet';

// The app bar, the settings frame and the modal surface: the chrome worth trying to reach.
const CHROME_ATTACK = [
  '.appbar { display: none !important }',
  'nav { display: none !important }',
  'html, body { display: none !important }',
  '.ds-dialog { display: none !important }',
].join('\n');

// Waits for the save's response: a navigation cancels a save in flight, and no
// field error is true before the save has begun.
async function saveCss(page: Page) {
  await Promise.all([
    page.waitForResponse((r) => r.request().method() === 'POST' && r.url().includes('saveFreeCss')),
    page.getByRole('button', { name: 'Save CSS' }).click(),
  ]);
}

// Posted to the forms' own actions, so it is stored and compiled the same way.
async function seedSheet(page: Page, css?: string): Promise<string> {
  expect((await formAction(page.request, '/settings/styles?/createSheet', { name: SHEET })).type).toBe('success');
  const [row] = await db<{ id: string }[]>`select id from stylesheets where name = ${SHEET}`;
  if (css !== undefined) {
    expect((await formAction(page.request, `/settings/styles/${row.id}?/saveFreeCss`, { css })).type).toBe('success');
  }
  return row.id;
}

async function artifactHref(page: Page): Promise<string | null> {
  return page.locator('link[rel="stylesheet"][href^="/api/styles/site/"]').getAttribute('href');
}

test.describe('custom styles', () => {
  // Site stylesheets style every page, so these tests run alone (tests/e2e/fixtures.ts).
  test.use({ storageState: authState('admin'), siteWide: true });

  // Through the database, so a test that fails partway can't strand a stylesheet.
  test.afterEach(async () => {
    await db`delete from stylesheets`;
  });

  test('free CSS aimed at the app chrome saves, and the chrome is untouched', async ({ page }) => {
    await page.goto(`/settings/styles/${await seedSheet(page)}`);
    await expect(page.locator('#free-css')).toBeVisible();

    await page.locator('#free-css').fill(CHROME_ATTACK);
    await saveCss(page);
    // Accepted: the compiler confines it rather than refusing it.
    await expect(page.locator('.ds-field-error')).toHaveCount(0);

    await expect(page.locator('nav.appbar')).toBeVisible();

    await page.goto(`/${seed.publicSlug}`);
    const css = await (await page.request.get((await artifactHref(page))!)).text();
    for (const rule of css.split('}').filter((r) => r.includes('{'))) {
      expect(rule.trimStart()).toMatch(/^(@|\.page-canvas)/);
    }

    const bar = page.locator('nav.appbar');
    await expect(bar).toBeVisible();
    expect(await bar.evaluate((el) => getComputedStyle(el).display)).toBe('flex');
    expect(await page.evaluate(() => getComputedStyle(document.body).display)).toBe('block');
  });

  test('a rule written as body reaches the canvas, outranking the base stylesheet', async ({ page }) => {
    await seedSheet(page, 'body { background: rgb(255, 250, 235) }');

    await page.goto(`/${seed.publicSlug}`);
    const bg = await page.locator('.page-canvas').evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).toBe('rgb(255, 250, 235)');
  });
});
