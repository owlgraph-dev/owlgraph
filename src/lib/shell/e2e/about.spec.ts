// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// AGPL-3.0 §13: every footer ends with the info icon, whatever its settings
// (docs/guides/deployment.md, "Source code for network users").
import type { APIResponse, Page } from '@playwright/test';
import { test, expect } from '$tests/e2e/fixtures';
import { formAction } from '$tests/e2e/api';
import { authState } from '$tests/e2e/seed-data';
import { horizontalOverflow } from '$tests/e2e/responsive';
import { db } from '../../platform/db.server';
import { parseCsp } from '../../platform/csp';
import { contrastRatio, parseColor } from '../../design-system/theme/color';
import { setColorPref } from '$tests/e2e/fixtures';

const ABOUT = 'About this software';
const ANONYMOUS = { cookies: [], origins: [] };
const DESKTOP = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844 };
const VIEWS = [
  ['desktop', DESKTOP, 'light'],
  ['phone', PHONE, 'light'],
  ['desktop, dark', DESKTOP, 'dark'],
  ['phone, dark', PHONE, 'dark'],
] as const;

/** One link to /-/about, a 44px target nothing covers, 3:1 against its ground. */
async function expectAboutIcon(page: Page) {
  const footer = page.locator('footer.site-footer');
  await expect(footer).toHaveCount(1);
  const link = footer.getByRole('link', { name: ABOUT, exact: true });
  await expect(link).toHaveCount(1);
  await expect(link).toHaveAttribute('href', '/-/about');
  await expect(link).toHaveAttribute('title', ABOUT);
  // A phone's shell reserves the bottom bar's height after the footer, so the
  // bar never sits on it.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(link).toBeInViewport();
  const box = (await link.boundingBox())!;
  expect(box.width, 'target width').toBeGreaterThanOrEqual(43.5);
  expect(box.height, 'target height').toBeGreaterThanOrEqual(43.5);
  const probe = await link.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const at = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    let ground = '';
    for (let a: Element | null = el.parentElement; a && !ground; a = a.parentElement) {
      const bg = getComputedStyle(a).backgroundColor;
      if (bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') ground = bg;
    }
    return { covered: !at || !(at === el || el.contains(at)), color: getComputedStyle(el).color, ground };
  });
  expect(probe.covered, 'nothing covers the icon').toBe(false);
  const ratio = contrastRatio(parseColor(probe.color)!, parseColor(probe.ground)!);
  expect(ratio, `the icon (${probe.color}) on its ground (${probe.ground})`).toBeGreaterThanOrEqual(3);
}

/** The icon alone, on the page's own surface. */
async function expectMinimalFooter(page: Page) {
  const footer = page.locator('footer.site-footer');
  await expect(footer.getByRole('link')).toHaveCount(1);
  expect((await footer.innerText()).trim(), 'no text beside the icon').toBe('');
  expect(await footer.evaluate((el) => getComputedStyle(el).backgroundColor), 'no ground of its own').toBe('rgba(0, 0, 0, 0)');
  await expectAboutIcon(page);
}

const styleSrc = (res: APIResponse | { headers(): Record<string, string> }) => parseCsp(res.headers()['content-security-policy'] ?? '').get('style-src') ?? [];

// It reads site-wide state the footer tests change, so it runs alone.
test.describe('the info icon on a footer nobody configured', () => {
  test.use({ siteWide: true, storageState: ANONYMOUS });

  for (const [name, viewport, colorScheme] of VIEWS) {
    test.describe(name, () => {
      test.use({ viewport, colorScheme });

      test('the home page, sign-in, a 404 and search end with the icon, in a footer of its own', async ({ page }) => {
        for (const [path, status] of [['/', 200], ['/login', 200], ['/no-such-page-anywhere', 404], ['/search', 200]] as const) {
          const res = await page.goto(path);
          expect(res?.status(), path).toBe(status);
          await expectMinimalFooter(page);
        }
      });
    });
  }
});

test.describe('the info icon on a configured, branded footer', () => {
  test.use({ siteWide: true, storageState: authState('admin') });

  const N = { column: 'E2E About column', link: 'E2E About link', legal: 'E2E About imprint', text: 'E2E About legal text', title: 'E2E About operator' };

  async function clearFooter(page: Page) {
    await db`delete from nav_tree_entries where consumer = 'footer' and label in (${N.column}, ${N.link})`;
    await db`delete from footer_links where label = ${N.legal}`;
    await formAction(page.request, '/settings/footer?/saveLegalText', { legalText: '' });
    await formAction(page.request, '/settings/footer?/saveBranding', { title: '', tagline: '', logoHeight: '32' });
    await formAction(page.request, '/settings/branding?/resetColors', {});
  }
  test.afterEach(async ({ page }) => clearFooter(page));

  test('ends the legal line in every scheme and width, reads on the footer colour, and outlives every footer setting', async ({ page, baseURL }) => {
    expect((await formAction(page.request, '/settings/footer?/createColumnEntry', { kind: 'group', label: N.column })).type).toBe('success');
    const [group] = await db<{ id: string }[]>`select id from nav_tree_entries where label = ${N.column} and consumer = 'footer'`;
    expect((await formAction(page.request, '/settings/footer?/createColumnEntry', { kind: 'link', label: N.link, targetType: 'url', url: 'https://example.org/docs', parentId: group.id })).type).toBe('success');
    expect((await formAction(page.request, '/settings/footer?/saveLegalText', { legalText: N.text })).type).toBe('success');
    expect((await formAction(page.request, '/settings/footer?/createLegalLink', { label: N.legal, targetType: 'url', url: 'https://example.org/imprint' })).type).toBe('success');
    expect((await formAction(page.request, '/settings/footer?/saveBranding', { title: N.title, tagline: '', logoHeight: '32' })).type).toBe('success');
    const colors = { accent: null, lightAccent: null, darkAccent: null, brand: [], footerLight: '#e8e2d4', footerDark: '#1d2433' };
    expect((await formAction(page.request, '/settings/branding?/saveColors', { colors: JSON.stringify(colors) })).type).toBe('success');

    const footer = page.locator('footer.site-footer');
    for (const [name, viewport, scheme] of VIEWS) {
      await setColorPref(page, baseURL!, scheme);
      await page.setViewportSize(viewport);
      await page.goto('/');
      await expect(footer.getByText(N.title), name).toBeVisible();
      await expect(footer.getByRole('link', { name: N.legal }), name).toBeVisible();
      // The legal line's last item, on whatever line it wraps to.
      await expect(footer.locator('.legal > *').last(), name).toHaveAttribute('aria-label', ABOUT);
      expect(await footer.evaluate((el) => getComputedStyle(el).backgroundColor), name).not.toBe('rgba(0, 0, 0, 0)');
      await expectAboutIcon(page);
      if (viewport === PHONE) expect(await horizontalOverflow(page), name).toEqual([]);
    }

    // The About page names the operator above its heading; their lines stay in the footer.
    await page.goto('/-/about');
    const about = page.locator('main');
    await expect(about.getByText(N.title, { exact: true })).toBeVisible();
    await expect(about.getByText(N.text, { exact: true })).toHaveCount(0);
    await expect(about.getByRole('link', { name: N.legal })).toHaveCount(0);
    await expect(footer.getByRole('link', { name: N.legal })).toBeVisible();

    // With the footer settings cleared, the icon stays.
    await clearFooter(page);
    await setColorPref(page, baseURL!, 'light');
    await page.setViewportSize(DESKTOP);
    await page.goto('/');
    await expectMinimalFooter(page);
  });
});

test.describe('the settings leaf', () => {
  test.use({ viewport: DESKTOP });

  test.describe('an admin', () => {
    test.use({ storageState: authState('admin') });

    test('finds About under General — in the sidebar, the overview and the search — and leaves for it with a full load', async ({ page }) => {
      const aboutDocument = () => page.waitForResponse((r) => new URL(r.url()).pathname === '/-/about' && r.request().resourceType() === 'document');
      // A client-side navigation would keep the settings' looser policy.
      const expectStrictDocument = (res: APIResponse | { headers(): Record<string, string> }) => {
        if (process.env.E2E_SERVER !== 'dev') expect(styleSrc(res)).not.toContain("'unsafe-inline'");
      };

      await page.goto('/settings');
      const nav = page.getByRole('navigation', { name: 'Settings sections' });
      const leaf = nav.getByRole('link', { name: 'About', exact: true });
      await expect(leaf).toHaveAttribute('href', '/-/about');
      const overview = page.locator('section').filter({ has: page.getByRole('heading', { level: 2, name: 'General' }) });
      await expect(overview.getByRole('link', { name: /^About/ })).toHaveAttribute('href', '/-/about');

      const [viaLeaf] = await Promise.all([aboutDocument(), leaf.click()]);
      expectStrictDocument(viaLeaf);
      await expect(page.getByRole('heading', { level: 1, name: ABOUT })).toBeVisible();

      await page.goto('/settings');
      const search = page.getByRole('searchbox', { name: 'Search settings …' });
      await search.fill('licence');
      await expect(page.getByLabel('Search results').getByRole('link', { name: /About/ })).toHaveAttribute('href', '/-/about');
      const [viaSearch] = await Promise.all([aboutDocument(), search.press('Enter')]);
      expectStrictDocument(viaSearch);
      await expect(page).toHaveURL(/\/-\/about$/);
    });
  });
});
