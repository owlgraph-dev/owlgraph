// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import type { APIResponse, Page, Response } from '@playwright/test';
import { test, expect, waitForHydration } from '$tests/e2e/fixtures';
import { authState } from '$tests/e2e/seed-data';
import { seedProbePage } from '$tests/e2e/probe-doc';
import { createPage, formAction, unique } from '$tests/e2e/api';
import { db } from '../../platform/db.server';
import { STYLE_SRC_PHASE, parseCsp } from '../../platform/csp';

// The strict style-src in a hydrated page (docs/architecture/overview.md, "Content
// Security Policy"). A reported violation already fails any test through the
// page fixture (tests/e2e/fixtures.ts); these cover what that cannot see.

test.skip(process.env.E2E_SERVER === 'dev', 'the strict style-src exists only in a production build');

const NONCE_SOURCE = /^'nonce-([A-Za-z0-9+/=]+)'$/;
const SHEET = 'CSP gate stylesheet';

function styleSrc(header: string | undefined): string[] {
  expect(header, 'a page response carries a Content-Security-Policy').toBeTruthy();
  return parseCsp(header!).get('style-src') ?? [];
}

function nonceOf(sources: string[]): string | null {
  for (const s of sources) {
    const m = NONCE_SOURCE.exec(s);
    if (m) return m[1];
  }
  return null;
}

/** A request's response, or the one a browser navigation got. */
type Answer = Pick<APIResponse, 'headers' | 'text'>;

async function renderedStyleNonces(res: Answer): Promise<string[]> {
  const html = await res.text();
  return Array.from(html.matchAll(/<style nonce="([^"]+)"/g), (m) => m[1]);
}

async function expectStrict(res: Answer) {
  const headers = res.headers();
  const enforced = styleSrc(headers['content-security-policy']);
  const reportOnly = headers['content-security-policy-report-only'];
  const nonces = await renderedStyleNonces(res);
  expect(nonces.length, 'the theme <style> carries a nonce').toBeGreaterThan(0);
  expect(new Set(nonces).size, 'one nonce per response').toBe(1);

  if (STYLE_SRC_PHASE === 'enforce') {
    expect(enforced).not.toContain("'unsafe-inline'");
    expect(nonceOf(enforced)).toBe(nonces[0]);
    expect(reportOnly).toBeUndefined();
  } else {
    expect(enforced).toContain("'unsafe-inline'");
    expect(nonceOf(enforced)).toBeNull();
    const reported = styleSrc(reportOnly);
    expect(reported).not.toContain("'unsafe-inline'");
    expect(nonceOf(reported)).toBe(nonces[0]);
    expect(parseCsp(reportOnly!).get('report-uri')).toEqual(['/api/csp-report']);
  }
  // The script half is SvelteKit's: its own nonce, no 'unsafe-inline'.
  const scriptSrc = parseCsp(headers['content-security-policy']).get('script-src') ?? [];
  expect(scriptSrc).not.toContain("'unsafe-inline'");
  expect(nonceOf(scriptSrc)).toBeTruthy();
}

async function expectNoStyleAttribute(res: APIResponse) {
  const html = await res.text();
  const hits = html.match(/<[^>]*\sstyle\s*=/g) ?? [];
  expect(hits, 'style attributes in the served markup').toEqual([]);
}

const paddingTop = (page: Page, selector: string) => page.locator(selector).first().evaluate((el) => getComputedStyle(el).paddingTop);

/**
 * The body lost an open overlay's modal styles and the app bar is hit-testable:
 * a blocked style-attribute restore breaks both.
 */
async function expectPageUsable(page: Page, when: string) {
  // The body styles come back as the overlay finishes closing.
  const state = () => page.evaluate(() => {
    const body = getComputedStyle(document.body);
    // The avatar trigger on a desktop, the Menu button on a phone.
    const control = Array.from(document.querySelectorAll('nav.appbar button, nav.appbar .ds-menu-trigger')).find((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    let reachable = 'no app bar control';
    if (control) {
      const r = control.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      // An ancestor hit means the click lands above the control, as a body
      // left with `pointer-events: none` does.
      reachable = hit && (control === hit || control.contains(hit)) ? 'reachable' : `covered by ${hit ? hit.tagName : 'nothing'}`;
    }
    return { pointerEvents: body.pointerEvents, overflow: body.overflow, reachable };
  });
  await expect.poll(state, { message: when }).toEqual({ pointerEvents: 'auto', overflow: 'visible', reachable: 'reachable' });
}

/** Created through the settings UI, since the create action returns no id. */
async function addGateSheet(page: Page, baseURL: string): Promise<string> {
  await page.goto('/settings/styles');
  await page.getByRole('button', { name: 'Add stylesheet' }).first().click();
  await expect(page.getByRole('heading', { name: 'Add stylesheet' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill(SHEET);
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await page.getByRole('link', { name: SHEET }).click();
  await page.waitForURL(/\/settings\/styles\/[^/]+$/);
  const sheetId = page.url().split('/').pop()!;
  // The compiler prefixes every selector with `.page-canvas`, so the rules are
  // bare. A form post outside a page needs the Origin SvelteKit's CSRF check wants.
  const saved = await page.request.post(`/settings/styles/${sheetId}?/saveFreeCss`, {
    form: { css: '.grid { --pad-d: 40px; }\n.flex-cell { --pad-d: 40px; }' },
    headers: { origin: baseURL },
  });
  expect(saved.ok(), await saved.text()).toBe(true);
  return sheetId;
}

async function expectDiagram(page: Page) {
  await page.locator('.mermaid').first().scrollIntoViewIfNeeded();
  const svg = page.locator('.mermaid svg').first();
  await expect(svg).toBeVisible({ timeout: 30000 });
  // Its stylesheet went in under the document's nonce.
  expect(await svg.locator('style').count()).toBe(1);
  expect(await svg.evaluate((el) => (el.querySelector('style') as HTMLStyleElement).nonce)).toBeTruthy();
  const box = await svg.boundingBox();
  expect(box!.width).toBeGreaterThan(100);
  expect(box!.height).toBeGreaterThan(40);
  // Themed: a node's fill comes from the content palette, not black.
  const fill = await svg.locator('.node rect, .node polygon, .node path').first().evaluate((el) => getComputedStyle(el).fill);
  expect(fill).not.toBe('none');
  expect(fill).not.toBe('rgb(0, 0, 0)');
  await page.evaluate(() => window.scrollTo(0, 0));
}

// The probe page (tests/e2e/probe-doc.ts) carries every block kind and emitter.
test.describe('strict routes: the document', () => {
  let probe: { id: string; slug: string };

  test.beforeAll(async ({ browser, baseURL }) => {
    const context = await browser.newContext({ baseURL, storageState: authState('admin') });
    const api = context.request;
    probe = await seedProbePage(api, 'adaptive');
    expect((await api.patch(`/api/pages/${probe.id}`, { data: { visibility: 'public' } })).ok()).toBe(true);
    await context.close();
  });

  test.describe('as a signed-in reader', () => {
    test.use({ storageState: authState('admin'), viewport: { width: 1280, height: 900 } });

    // A site stylesheet the block's own override must still beat. It styles
    // every page while it exists, so the test runs alone and removes it.
    test.describe('with a site custom stylesheet', () => {
      test.use({ siteWide: true });

      test('the probe page: header, no style attribute, a drawn diagram, the cascade', async ({ page, request, baseURL }) => {
        const sheetId = await addGateSheet(page, baseURL!);
        try {
          const res = await request.get(`/${probe.slug}`);
          await expectStrict(res);
          await expectNoStyleAttribute(res);

          await page.goto(`/${probe.slug}`);
          await expect(page.locator('article.prose')).toBeVisible();
          await page.waitForLoadState('networkidle');
          expect(await page.locator('[style]:not(#svelte-announcer)').count(), 'style attributes in the hydrated DOM (the announcer is allowed by hash)').toBe(0);
          // The quick links are islands, hydrated from the app bundle without inline script.
          const cards = page.locator('[data-island="quickLink"] a.quick-link');
          await expect(cards).toHaveCount(3);
          for (const card of await cards.all()) await expect(card).toHaveAttribute('data-hydrated', 'true');

          await expectDiagram(page);

          // The cascade (docs/architecture/design-system/tokens.md, "Cascade layers"):
          // a block's override (24px) beats the site's custom CSS (40px) and the theme's containers default (8px);
          expect(await paddingTop(page, 'article.prose .canvas-blocks > .grid-block > .grid')).toBe('24px');
          expect(await paddingTop(page, '.flex-cell')).toBe('12px');
          // the custom CSS is live where nothing overrides it (the query template's container);
          expect(await paddingTop(page, '.query-block .grid')).toBe('40px');
          // a kind pin beats the theme default (the result container is flush);
          expect(await paddingTop(page, 'div.query-block')).toBe('0px');
          // an author's inline style in an HTML block beats .prose.
          expect(await page.locator('.html-block p').first().evaluate((el) => getComputedStyle(el).marginTop)).toBe('0px');

          await page.emulateMedia({ media: 'print' });
          expect((await page.pdf()).length).toBeGreaterThan(1000);
          await page.emulateMedia({ media: null });
        } finally {
          await page.request.post('/settings/styles?/deleteSheet', { form: { id: sheetId }, headers: { origin: baseURL! } });
        }
      });
    });

    // A restore through `body.setAttribute('style', …)` is blocked, leaving the
    // body at `pointer-events: none`. bits-ui's scroll lock restores that way, so
    // every floating primitive opts out or locks through design-system/scrollLock.ts.
    test('every overlay opens and closes, leaving the page usable', async ({ page }) => {
      await page.goto(`/${probe.slug}`);
      await expect(page.locator('article.prose')).toBeVisible();
      await page.waitForLoadState('networkidle');

      // A scroll lock is taken once an overlay shows, so each open waits for that.
      const tab = page.locator('.ust-tab');
      const overlays: { name: string; open: () => Promise<unknown>; close: () => Promise<unknown>; shown: (open: boolean) => Promise<void> }[] = [
        {
          name: 'account menu',
          open: () => page.locator('nav.appbar .ds-menu-trigger').last().click(),
          close: () => page.keyboard.press('Escape'),
          shown: (open) => (open ? expect(page.getByRole('menu')).toBeVisible() : expect(page.getByRole('menu')).toBeHidden()),
        },
        {
          name: 'search overlay',
          open: () => page.getByRole('button', { name: 'Search' }).click(),
          close: () => page.keyboard.press('Escape'),
          shown: (open) => (open ? expect(page.getByRole('dialog')).toBeVisible() : expect(page.getByRole('dialog')).toBeHidden()),
        },
        {
          name: 'create modal',
          open: () => page.getByRole('button', { name: 'Create' }).first().click(),
          close: () => page.keyboard.press('Escape'),
          shown: (open) => (open ? expect(page.getByRole('dialog')).toBeVisible() : expect(page.getByRole('dialog')).toBeHidden()),
        },
        {
          name: 'local graph',
          open: () => tab.click(),
          close: () => tab.click(),
          shown: (open) => expect(tab).toHaveAttribute('aria-pressed', String(open)),
        },
      ];
      for (const { name, open, close, shown } of overlays) {
        await open();
        await shown(true);
        await close();
        await shown(false);
        await expectPageUsable(page, `after the ${name}`);
      }
    });

    test('Edit is a full navigation, and the editor still styles its blocks', async ({ page }) => {
      await page.goto(`/${probe.slug}`);
      await expect(page.locator('article.prose')).toBeVisible();
      await page.evaluate(() => ((window as unknown as { __stay: number }).__stay = 1));
      await page.getByRole('link', { name: 'Edit' }).first().click();
      await page.waitForURL(/\/edit$/);
      // A new document: the marker is gone.
      expect(await page.evaluate(() => (window as unknown as { __stay?: number }).__stay)).toBeUndefined();
      await expect(page.locator('.ProseMirror')).toBeVisible();
      expect(await paddingTop(page, '.ProseMirror .grid')).toBe('24px');
    });
  });

  // On a phone AccountMenu is a BottomSheet, not a DropdownMenu.
  test.describe('on a phone', () => {
    test.use({ storageState: authState('admin'), viewport: { width: 390, height: 844 } });

    test('the account sheet opens and closes, leaving the page usable', async ({ page }) => {
      await page.goto(`/${probe.slug}`);
      await expect(page.locator('article.prose')).toBeVisible();
      const sheet = page.getByRole('dialog');
      await page.getByRole('button', { name: 'Menu', exact: true }).click();
      await expect(sheet).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toBeHidden();
      await expectPageUsable(page, 'after the account sheet');
    });
  });
});

// A policy belongs to the document (platform/cspRoutes.ts): a client-side
// navigation from a loose route would run the reader page under the looser
// policy, so a link from there to a reader page loads it anew.
test.describe('loose routes: the links back to a reader page', () => {
  test.use({ storageState: authState('admin') });

  const entry = unique('E2E loose nav');
  let target: { id: string; slug: string };

  test.beforeEach(async ({ page }) => {
    target = await createPage(page.request);
    const created = await formAction(page.request, '/settings/navigation?/create', { kind: 'link', label: entry.name, targetType: 'page', targetPageId: target.id });
    expect(created.type, 'create the nav entry').toBe('success');
  });
  test.afterEach(async () => {
    await db`delete from nav_tree_entries where consumer = 'nav' and label = ${entry.name}`;
  });

  /** A client-side navigation keeps the window marker, so it fails at once. */
  async function expectFullLoad(page: Page, pathname: string, follow: () => Promise<unknown>) {
    await page.evaluate(() => ((window as unknown as { __loose: number }).__loose = 1));
    const documents: Response[] = [];
    const onResponse = (r: Response) => {
      if (r.request().isNavigationRequest() && new URL(r.url()).pathname === pathname) documents.push(r);
    };
    page.on('response', onResponse);
    try {
      await follow();
      await page.waitForURL((url) => url.pathname === pathname);
      await waitForHydration(page);
    } finally {
      page.off('response', onResponse);
    }
    expect(await page.evaluate(() => (window as unknown as { __loose?: number }).__loose), `${pathname} is a new document`).toBeUndefined();
    expect(documents, `the document response for ${pathname}`).toHaveLength(1);
    await expectStrict(documents[0]);
  }

  /** A page's path carries its namespace, so read it off the link. */
  async function pathOf(link: ReturnType<Page['getByRole']>): Promise<string> {
    return new URL((await link.getAttribute('href'))!, 'http://app.test').pathname;
  }

  test.describe('on a desktop', () => {
    test.use({ viewport: { width: 1280, height: 900 } });

    test("from the settings, the app bar's logo and its nav entries load the reader page anew", async ({ page }) => {
      const bar = page.getByRole('navigation', { name: 'Primary' });
      await page.goto('/settings');
      await expectFullLoad(page, '/', () => bar.getByRole('link', { name: 'Home', exact: true }).click());

      await page.goto('/settings/profile');
      const link = bar.getByRole('link', { name: entry.name, exact: true });
      await expectFullLoad(page, await pathOf(link), () => link.click());
    });

    test('from the editor, the logo in its head loads the reader page anew', async ({ page }) => {
      await page.goto(`/${target.slug}/edit`);
      await expect(page.locator('.ProseMirror')).toBeVisible();
      await expectFullLoad(page, '/', () => page.getByRole('link', { name: 'Home', exact: true }).click());
    });

    // The editor leaves with goto(); the root layout turns a navigation that
    // crosses the policy into a full one.
    test('from the editor, deleting the page loads the reader page anew', async ({ page }) => {
      const doomed = await createPage(page.request);
      await page.goto(`/${doomed.slug}/edit`);
      await expect(page.locator('.ProseMirror')).toBeVisible();
      await page.getByRole('button', { name: 'More' }).click();
      await page.getByRole('menuitem', { name: 'Delete page' }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog.getByRole('heading', { name: 'Delete this page?' })).toBeVisible();
      await expectFullLoad(page, '/', () => dialog.getByRole('button', { name: 'Delete' }).click());
    });
  });

  // A phone's app bar moves the nav entries into the Menu sheet.
  test.describe('on a phone', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("from the settings, the app bar's logo loads the reader page anew", async ({ page }) => {
      await page.goto('/settings');
      await expectFullLoad(page, '/', () => page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Home', exact: true }).click());
    });

    // The sheet portals out of the bar's nav element, so its links carry the
    // reload themselves (PhoneNavSheet.svelte).
    test("from the settings, the Menu sheet's nav entries load the reader page anew", async ({ page }) => {
      await page.goto('/settings');
      await page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: 'Menu', exact: true }).click();
      const link = page.getByRole('dialog').getByRole('link', { name: entry.name, exact: true });
      await expect(link).toBeVisible();
      await expectFullLoad(page, await pathOf(link), () => link.click());
    });
  });
});
