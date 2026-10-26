// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import type { Page } from '@playwright/test';
import { test, expect, sameOrigin } from '$tests/e2e/fixtures';
import AxeBuilder from '@axe-core/playwright';
import { createPage, formAction } from '$tests/e2e/api';
import { doc, txt } from '$tests/e2e/doc';
import { authState } from '$tests/e2e/seed-data';
import { db } from '../../../platform/db.server';
import { generateAccent, type StoredTheme } from '../../../design-system/theme/siteTheme';
import { contrastRatio, parseColor } from '../../../design-system/theme/color';
import { setColorPref } from '$tests/e2e/fixtures';
import { blockSettings } from '$tests/e2e/editor';

// The theme is site-wide: every test here runs alone (tests/e2e/fixtures.ts).
test.use({ siteWide: true });

const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};

const saveColors = (page: Page, colors: object) =>
  formAction(page.request, '/settings/branding?/saveColors', {
    colors: JSON.stringify({ accent: null, lightAccent: null, darkAccent: null, brand: [], ...colors }),
  });

async function storedTheme(): Promise<StoredTheme> {
  const [row] = await db<{ tokens: StoredTheme }[]>`select tokens from themes where scope_kind = 'site'`;
  return row.tokens;
}

async function adaptivePage(page: Page, ...content: unknown[]): Promise<string> {
  return (await createPage(page.request, { doc: doc(...content), contentScheme: 'adaptive' })).slug;
}

test.describe('site theme', () => {
  test.use({ storageState: authState('admin') });

  test.afterEach(async ({ page }) => {
    await formAction(page.request, '/settings/branding?/resetColors', {});
    await formAction(page.request, '/settings/branding?/removeDark', {});
  });

  test('a brand accent reaches the interface and adaptive pages, as a readable step in each scheme', async ({ page, baseURL }) => {
    expect((await saveColors(page, { accent: '#0a7d3b' })).type).toBe('success');
    const slug = await adaptivePage(page, {
      type: 'paragraph',
      content: [txt('A ', []), txt('link', [{ type: 'link', attrs: { href: 'https://example.com' } }])],
    });

    for (const scheme of ['light', 'dark'] as const) {
      const expected = generateAccent(scheme, '#0a7d3b')!.accent;
      await setColorPref(page, baseURL!, scheme);
      await page.goto(`/${slug}`);
      const accent = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ds-color-accent').trim());
      expect(accent, scheme).toBe(expected);
      expect(await page.locator('.page-canvas a[href="https://example.com"]').evaluate((el) => getComputedStyle(el).color), scheme).toBe(rgb(expected));
    }
  });

  test('a brand colour is offered to authors and follows the scheme on the page', async ({ page, baseURL }) => {
    expect((await saveColors(page, { brand: [{ id: null, name: 'Ocean', light: '#0b3d91', dark: '#8fb8ff' }] })).type).toBe('success');
    const ocean = (await storedTheme()).brand![0];
    const slug = await adaptivePage(page, {
      type: 'grid',
      attrs: { columnWidths: [1] },
      content: [{ type: 'gridCell', attrs: { surface: { desktop: { bg: `token:brand.${ocean.id}` } } }, content: [{ type: 'paragraph', content: [txt('On the ocean')] }] }],
    });

    const cell = page.locator('.grid-cell', { hasText: 'On the ocean' });
    await setColorPref(page, baseURL!, 'light');
    await page.goto(`/${slug}`);
    expect(await cell.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(rgb('#0b3d91'));
    expect(await page.getByText('On the ocean').evaluate((el) => getComputedStyle(el).color)).toBe('rgb(255, 255, 255)');
    await setColorPref(page, baseURL!, 'dark');
    await page.reload();
    expect(await cell.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(rgb('#8fb8ff'));

    await page.goto(`/${slug}/edit`);
    await expect(async () => {
      await page.locator('.editor .grid-cell .ph-content, .editor .grid-cell p').first().click();
      await page.getByRole('navigation', { name: 'Block ancestry' }).getByRole('button', { name: 'Cell', exact: true }).click({ timeout: 1000 });
    }).toPass({ timeout: 15000 });
    await blockSettings(page).getByRole('button', { name: 'Background', exact: true }).click();
    await expect(page.getByRole('group', { name: 'Theme' }).getByRole('button', { name: 'Ocean', exact: true })).toBeVisible();
  });

  test('the footer takes its background per scheme, with the text that reads on it', async ({ page, baseURL }) => {
    await formAction(page.request, '/settings/footer?/saveLegalText', { legalText: 'E2E footer colours' });
    expect((await saveColors(page, { footerLight: '#e8e2d4', footerDark: '#1d2433' })).type).toBe('success');

    const footer = page.locator('footer.site-footer');
    // Light: a cream ground with the interface's dark text; dark: a deep blue with its light text.
    for (const [scheme, background, text] of [
      ['light', rgb('#e8e2d4'), 'rgb(29, 29, 31)'],
      ['dark', rgb('#1d2433'), 'rgb(236, 235, 232)'],
    ] as const) {
      await setColorPref(page, baseURL!, scheme);
      await page.goto('/');
      expect(await footer.evaluate((el) => getComputedStyle(el).backgroundColor), scheme).toBe(background);
      expect(await footer.getByText('E2E footer colours').evaluate((el) => getComputedStyle(el).color), scheme).toBe(text);
    }

    // Unset for one scheme, that scheme's footer is the plain one again: the page ground.
    expect((await saveColors(page, { footerDark: null, footerLight: '#e8e2d4' })).type).toBe('success');
    await page.goto('/');
    const pageGround = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ds-color-bg').trim());
    expect(await footer.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(rgb(pageGround));
    await formAction(page.request, '/settings/footer?/saveLegalText', { legalText: '' });
  });

  test('the app bar takes its background per scheme, with readable controls and matching browser chrome', async ({ page, baseURL }) => {
    expect((await saveColors(page, { appbarLight: '#0b3d91', appbarDark: '#0a2455' })).type).toBe('success');

    const bar = page.locator('nav.appbar');
    for (const [scheme, color] of [
      ['light', '#0b3d91'],
      ['dark', '#0a2455'],
    ] as const) {
      await setColorPref(page, baseURL!, scheme);
      await page.goto('/settings/profile');
      expect(await bar.evaluate((el) => getComputedStyle(el).backgroundColor), scheme).toBe(rgb(color));
      // The icons follow the text colour as currentColor.
      const text = await bar.evaluate((el) => getComputedStyle(el).color);
      expect(contrastRatio(parseColor(text)!, parseColor(color)!), `${scheme} ${text}`).toBeGreaterThanOrEqual(4.5);
      // An explicit preference gives both theme-color metas that scheme's colour.
      await expect(page.locator('meta[name="theme-color"]').first()).toHaveAttribute('content', color);
      const results = await new AxeBuilder({ page }).include('nav.appbar').withRules(['color-contrast']).analyze();
      expect(results.violations.flatMap((v) => v.nodes.map((n) => `${scheme} ${n.target}`))).toEqual([]);
    }

    // Unset for one scheme, that scheme's bar is the plain one again.
    expect((await saveColors(page, { appbarLight: '#0b3d91' })).type).toBe('success');
    await page.goto('/settings/profile');
    const pageGround = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ds-color-bg').trim());
    expect(await bar.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(rgb(pageGround));
  });

  test("a nav submenu inside a branded bar keeps the page's colours, not the bar's", async ({ page, baseURL }) => {
    const nav = (form: Record<string, string>) => formAction(page.request, '/settings/navigation?/create', form);
    expect((await nav({ kind: 'group', label: 'E2E theme group' })).type).toBe('success');
    const [group] = await db<{ id: string }[]>`select id from nav_tree_entries where label = 'E2E theme group' and consumer = 'nav'`;
    expect((await nav({ kind: 'link', label: 'E2E theme child', targetType: 'url', url: 'https://example.com', parentId: group.id })).type).toBe('success');
    expect((await saveColors(page, { appbarLight: '#3730a3' })).type).toBe('success');

    try {
      await setColorPref(page, baseURL!, 'light');
      await page.goto('/');
      const sublink = page.getByRole('link', { name: 'E2E theme child' });
      await page.getByRole('button', { name: 'E2E theme group' }).hover();
      await expect(sublink).toBeVisible();
      // The submenu hangs from the bar but sits on the page's ground.
      const pageText = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ds-color-fg').trim());
      expect(await sublink.evaluate((el) => getComputedStyle(el).color)).toBe(rgb(pageText));
      const results = await new AxeBuilder({ page }).include('.ds-navmenu-content').withRules(['color-contrast']).analyze();
      expect(results.violations.flatMap((v) => v.nodes.map((n) => `${n.target}`))).toEqual([]);
    } finally {
      await db`delete from nav_tree_entries where label in ('E2E theme group', 'E2E theme child')`;
    }
  });

  test('a dark logo shows wherever the dark scheme is in use, the light one elsewhere', async ({ page, baseURL }) => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="30"><rect width="80" height="30" fill="#eee"/></svg>');
    // A plain multipart post, not formAction: the action answers a refused upload with a 400 page.
    const upload = await page.request.post('/settings/branding?/uploadDark', {
      multipart: { file: { name: 'dark.svg', mimeType: 'image/svg+xml', buffer: svg } },
      headers: sameOrigin(),
    });
    expect(upload.ok()).toBe(true);

    const darkLogo = page.locator('nav.appbar a.logo img.for-dark');
    await setColorPref(page, baseURL!, 'dark');
    await page.goto('/settings/profile');
    await expect(darkLogo).toBeVisible();
    await expect(page.locator('nav.appbar a.logo .for-light')).toBeHidden();
    await setColorPref(page, baseURL!, 'light');
    await page.reload();
    await expect(darkLogo).toBeHidden();
    await expect(page.locator('nav.appbar a.logo .for-light')).toBeVisible();
  });
});
