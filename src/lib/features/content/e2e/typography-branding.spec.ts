// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import type { Locator, Page } from '@playwright/test';
import { test, expect } from '$tests/e2e/fixtures';
import { authState } from '$tests/e2e/seed-data';
import { createPage } from '$tests/e2e/api';
import { db } from '../../../platform/db.server';

// /settings/branding also holds the logo section, so locators are scoped to
// the token cards and the styles table, clear of the logo's "remove". The run
// is in English; Subtitle is the seeded h2 default.

// The picker auto-submits its row's form: wait for the save before relying on it.
async function pickStyleToken(page: Page, style: string, optionLabel: string): Promise<void> {
  const option = page.getByRole('option', { name: optionLabel });
  await page.getByRole('combobox', { name: `Token for ${style}` }).click();
  await expect(option).toBeVisible();
  const saved = page.waitForResponse((res) => res.url().includes('?/setParagraphStyleToken') && res.ok());
  await option.click();
  await saved;
}

// A menu entry is named by its label and its element ("Subtitle h2").
async function pickParagraphStyle(page: Page, label: string): Promise<void> {
  const item = page.getByRole('menuitem', { name: new RegExp(`^${label}\\b`) });
  await page.getByRole('button', { name: 'Paragraph style' }).click();
  await expect(item).toBeVisible();
  await item.click();
}

// `input[value=...]` matches only the initial attribute; Svelte's binding sets
// the property, so the card is found by reading values.
async function findTokenCard(page: Page, name: string): Promise<Locator> {
  let found!: Locator;
  await expect(async () => {
    const cards = await page.locator('.token-card').all();
    for (const card of cards) {
      if ((await card.locator('input[name="name"]').inputValue()) === name) {
        found = card;
        return;
      }
    }
    throw new Error(`no token card named "${name}" yet`);
  }).toPass({ timeout: 15000 });
  return found;
}

test.describe('typography tokens & paragraph styles (admin)', () => {
  // They restyle every page's headings: these tests run alone (tests/e2e/fixtures.ts).
  test.use({ storageState: authState('admin'), siteWide: true });

  // A test failing halfway must not leave every page restyled, so the seed is
  // restored through the database. The extra style goes before Subtitle takes
  // the h2 default back (one default per element).
  test.afterEach(async () => {
    await db`delete from typography_tokens where name like 'H2 Big %' or name like 'Legacy px %'`;
    await db`delete from paragraph_styles where label ->> 'en' like 'E2E Interheading %'`;
    await db`
      update paragraph_styles set is_default = true
      where label ->> 'en' = 'Subtitle' and render_as = 'h2'
        and not exists (select 1 from paragraph_styles where render_as = 'h2' and is_default)`;
  });

  test('a token assigned to the h2 style changes an untouched heading in both editor and public page', async ({ page }) => {
    await page.goto('/settings/branding');

    const tokenName = `H2 Big ${Date.now()}`;
    await page.getByLabel('Token name').fill(tokenName);
    await page.getByRole('button', { name: 'Add token' }).click();
    const tokenCard = await findTokenCard(page, tokenName);

    await tokenCard.getByRole('combobox', { name: 'Size' }).click();
    await page.getByRole('option', { name: '3xl · 1.875rem', exact: true }).click();
    await tokenCard.getByRole('combobox', { name: 'Weight' }).click();
    await page.getByRole('option', { name: 'Bold', exact: true }).click();
    const saved = page.waitForResponse((res) => res.url().includes('?/updateTypographyToken') && res.ok());
    await tokenCard.getByRole('button', { name: 'save' }).click();
    await saved;
    await expect(tokenCard.getByRole('combobox', { name: 'Size' })).toContainText('3xl');

    await pickStyleToken(page, 'Subtitle', tokenName);

    const { slug } = await createPage(page.request);
    await page.goto(`/${slug}/edit`);
    const proseMirror = page.locator('.ProseMirror');
    await proseMirror.click();
    await page.keyboard.type('A heading');
    await pickParagraphStyle(page, 'Subtitle');
    await expect(proseMirror.locator('h2')).toHaveCount(1);
    // A theme stylesheet rule on data-ps, never an inline var; 3xl is 1.875rem on a wide canvas.
    const heading = proseMirror.locator('h2');
    await expect(heading).toHaveAttribute('data-ps', /.+/);
    await expect(heading).toHaveCSS('font-size', '30px');
    await expect(heading).toHaveCSS('font-weight', '700');

    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Saved')).toBeVisible({ timeout: 15000 });

    await page.goto(`/${slug}`);
    const publicHeading = page.locator('article.prose h2');
    await expect(publicHeading).toHaveCSS('font-size', '30px');
    await expect(publicHeading).toHaveCSS('font-weight', '700');

    await page.goto('/settings/branding');
    await pickStyleToken(page, 'Subtitle', 'Unbranded (default)');
    const cardToRemove = await findTokenCard(page, tokenName);
    await cardToRemove.getByRole('button', { name: 'remove' }).click();
    // The empty state, since `.not.toContainText` on a zero-match locator is unreliable.
    await expect(page.getByText('No tokens yet')).toBeVisible();
  });
});

// Reads the seeded styles only; the site-wide tests above are held off meanwhile.
test.describe('built-in looks (admin)', () => {
  test.use({ storageState: authState('admin') });

  test('the Display style makes a paragraph an h1 in the built-in display look when no token is assigned', async ({ page }) => {
    const { slug } = await createPage(page.request);
    await page.goto(`/${slug}/edit`);
    const proseMirror = page.locator('.ProseMirror');
    await proseMirror.click();
    await page.keyboard.type('Hero text');

    await pickParagraphStyle(page, 'Display');

    await expect(proseMirror.locator('h1[data-paragraph-style]')).toHaveCount(1);
    const hero = proseMirror.locator('h1[data-paragraph-style]');
    await expect(hero).toHaveCSS('font-size', '60px');
    await expect(hero).toHaveCSS('font-weight', '600');
  });
});
