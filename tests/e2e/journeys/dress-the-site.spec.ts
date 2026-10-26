// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures';
import { authState } from '../seed-data';
import { createPage, unique } from '../api';
import { doc, txt } from '../doc';
import { db } from '../../../src/lib/platform/db.server';
import { posting } from '../api';

// A real 1×1 PNG: an upload is decoded and measured (docs/architecture/media.md).
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');

// The site settings this journey writes: what it puts back afterwards.
const SETTINGS = ['logo_asset_id', 'home_page_id', 'footer_legal_text', 'footer_branding_show_logo', 'footer_branding_title', 'footer_branding_tagline', 'footer_branding_logo_height'];

/** Opens a settings section through the settings search, as the sidebar offers it. */
async function reach(page: Page, query: string, section: string, path: string) {
  await page.getByRole('searchbox', { name: 'Search settings …' }).fill(query);
  await page.getByLabel('Search results').getByRole('link', { name: new RegExp(`${section}$`) }).click();
  await expect(page).toHaveURL(new RegExp(`${path}$`));
  await expect(page.getByRole('heading', { level: 1, name: section })).toBeVisible();
}

test.describe('dressing the site', () => {
  // The logo, footer, navigation and home page are every page's, so this runs alone.
  test.use({ storageState: authState('admin'), siteWide: true, viewport: { width: 1280, height: 900 } });

  test('an admin finds each section through the settings search and dresses the site, and a viewer sees all of it on /', async ({ page, browser }) => {
    test.setTimeout(120_000);
    const before = await db<{ key: string; value: string }[]>`select key, value from site_settings where key in ${db(SETTINGS)}`;
    const n = {
      nav: unique('Handbook link').name,
      column: unique('Resources').name,
      columnLink: unique('Docs').name,
      legalText: `© 2026 ${unique('Journey Org').name}`,
      legalLink: unique('Imprint').name,
    };
    // Pages a signed-in viewer may read: the navigation's target and the home page.
    const handbookTitle = unique('Handbook').name;
    const handbook = await createPage(page.request, { visibility: 'internal', title: handbookTitle });
    const homeTitle = unique('Welcome aboard').name;
    const homeBody = `${homeTitle}: start here.`;
    const home = await createPage(page.request, { visibility: 'internal', title: homeTitle, doc: doc({ type: 'paragraph', content: [txt(homeBody)] }) });

    try {
      await page.goto('/settings');

      await test.step('they upload a logo, found under Branding', async () => {
        await reach(page, 'logo', 'Branding', '/settings/branding');
        const chooser = page.waitForEvent('filechooser');
        await page.getByRole('button', { name: 'Upload logo', exact: true }).click();
        await posting(page, 'upload', async () => (await chooser).setFiles({ name: 'logo.png', mimeType: 'image/png', buffer: PNG }));
        await expect(page.getByRole('img', { name: 'Current logo' })).toBeVisible();
      });

      await test.step('they add a footer column with a link, a legal line, and show the logo in the footer', async () => {
        await reach(page, 'imprint', 'Footer', '/settings/footer');
        const columns = page.locator('section.columns-section');
        await page.getByRole('button', { name: 'Add group' }).click();
        const dialog = page.getByRole('dialog');
        await dialog.getByLabel('Label').fill(n.column);
        await posting(page, 'createColumnEntry', () => dialog.getByRole('button', { name: 'Save' }).click());
        const column = columns.locator('li.node:not(.child)').filter({ hasText: n.column });
        await expect(column).toBeVisible();
        await column.getByRole('button', { name: 'Add link' }).click();
        await dialog.getByLabel('Label').fill(n.columnLink);
        await dialog.getByRole('radio', { name: 'External URL' }).click();
        await dialog.getByLabel('URL', { exact: true }).fill('https://example.org/docs');
        await posting(page, 'createColumnEntry', () => dialog.getByRole('button', { name: 'Save' }).click());
        await expect(column.locator('li.node.child').filter({ hasText: n.columnLink })).toBeVisible();

        const legal = page.locator('section.legal-section');
        await legal.getByLabel('Text', { exact: true }).fill(n.legalText);
        await posting(page, 'saveLegalText', () => legal.getByRole('button', { name: 'Save text' }).click());
        await expect(legal.getByRole('button', { name: 'Save text' })).toHaveCount(0);
        await legal.getByLabel('Label', { exact: true }).fill(n.legalLink);
        await legal.getByRole('radio', { name: 'External URL' }).click();
        await legal.getByLabel('URL', { exact: true }).fill('https://example.org/imprint');
        await posting(page, 'createLegalLink', () => legal.getByRole('button', { name: 'Add link' }).click());
        await expect(legal.locator('li.entry').filter({ hasText: n.legalLink })).toBeVisible();

        const branding = page.locator('section.branding-section');
        const showLogo = branding.getByRole('switch', { name: 'Show logo' });
        await showLogo.click();
        await expect(showLogo).toHaveAttribute('aria-checked', 'true');
        await posting(page, 'saveBranding', () => branding.getByRole('button', { name: 'Save branding' }).click());
      });

      await test.step('they add a navigation link to a page', async () => {
        await reach(page, 'menu', 'Navigation', '/settings/navigation');
        await page.getByRole('button', { name: 'Add link' }).click();
        const dialog = page.getByRole('dialog', { name: 'Add link' });
        await dialog.getByLabel('Label').fill(n.nav);
        await dialog.getByPlaceholder('Search pages…').fill(handbookTitle);
        await dialog.getByRole('option', { name: new RegExp(handbook.slug) }).click();
        await posting(page, 'create', () => dialog.getByRole('button', { name: 'Save' }).click());
        await expect(page.locator('li.node').filter({ hasText: n.nav })).toBeVisible();
      });

      await test.step('they pick the home page', async () => {
        await reach(page, 'homepage', 'Home page', '/settings/home');
        await page.getByRole('button', { name: 'Set home page' }).click();
        await page.getByPlaceholder('Search pages…').fill(homeTitle);
        await page.getByRole('option', { name: new RegExp(home.slug) }).click();
        await posting(page, 'setHome', () => page.getByRole('button', { name: 'Set as home' }).click());
        await expect(page.getByText(`/${home.slug}`, { exact: true })).toBeVisible();
      });

      await test.step('they leave for About with a full load, under the dressed footer', async () => {
        const aboutDocument = page.waitForResponse((r) => new URL(r.url()).pathname === '/-/about' && r.request().resourceType() === 'document');
        const search = page.getByRole('searchbox', { name: 'Search settings …' });
        await search.fill('licence');
        await search.press('Enter');
        expect((await aboutDocument).ok()).toBe(true);
        await expect(page.getByRole('heading', { level: 1, name: 'About this software' })).toBeVisible();
        await expect(page.locator('footer.site-footer img.brand-logo')).toBeVisible();
      });

      await test.step('a viewer opening / lands on the home page, under the navigation and footer the admin made', async () => {
        const viewerContext = await browser.newContext({ storageState: authState('viewer'), viewport: { width: 1280, height: 900 } });
        try {
          const viewer = await viewerContext.newPage();
          await viewer.goto('/');
          await expect(viewer).toHaveURL(new RegExp(`/${home.slug}$`));
          await expect(viewer.getByText(homeBody)).toBeVisible();

          await expect(viewer.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: n.nav })).toHaveAttribute('href', `/${handbook.slug}`);

          const footer = viewer.locator('footer.site-footer');
          await expect(footer.getByRole('heading', { name: n.column })).toBeVisible();
          await expect(footer.getByRole('link', { name: n.columnLink })).toHaveAttribute('href', 'https://example.org/docs');
          const legal = footer.locator('.legal');
          await expect(legal.getByText(n.legalText)).toBeVisible();
          await expect(legal.getByRole('link', { name: n.legalLink })).toHaveAttribute('href', 'https://example.org/imprint');
          const logo = footer.locator('.branding img.brand-logo');
          await expect(logo).toBeVisible();
          await expect(logo).toHaveAttribute('src', /^\/api\/media\/branding\/logo\//);
        } finally {
          await viewerContext.close();
        }
      });
    } finally {
      // The site as it was found, through the database.
      await db`delete from nav_tree_entries where label in ${db([n.nav, n.column, n.columnLink])}`;
      await db`delete from footer_links where label = ${n.legalLink}`;
      const [logo] = await db<{ value: string }[]>`select value from site_settings where key = 'logo_asset_id'`;
      await db`delete from site_settings where key in ${db(SETTINGS)}`;
      for (const row of before) await db`insert into site_settings ${db(row, 'key', 'value')}`;
      if (logo && !before.some((r) => r.key === 'logo_asset_id' && r.value === logo.value)) await db`delete from assets where id = ${logo.value}`;
    }
  });
});
