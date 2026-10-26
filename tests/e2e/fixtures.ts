// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { test as base, expect, type Browser, type Page, type Response } from '@playwright/test';
import { db } from '../../src/lib/platform/db.server';

// The `test` every spec imports (docs/guides/testing.md, "Isolation"): `siteWide`
// takes an exclusive advisory lock every other test holds shared, `lock`
// serializes the tests naming one resource. Transaction-scoped, so a failed
// test never leaks one; they cover the test and its hooks, never beforeAll.
const SITE_WIDE_KEY = 987654320;
// The two-key form, a key space apart from the site-wide lock.
const RESOURCE_SPACE = 987654321;

/**
 * The shared resources a test can lock. `seeded-pages` is for a test that
 * rewrites and restores the seeded pages; `integration-settings` for one that
 * points an integration at its own mock server.
 */
export type Resource = 'home' | 'logo' | 'seeded-pages' | 'integration-settings';

// A CSP violation the page logs fails the test (docs/guides/testing.md, "The CSP
// guard"); contexts a test opens itself aren't watched. goto() and reload()
// resolve only once the app page has hydrated (docs/guides/testing.md, "Hydration").
export const test = base.extend<
  { siteWide: boolean; lock: Resource | null; cspViolations: 'fail' | 'allowed'; isolation: void },
  { hydrationAware: void }
>({
  siteWide: [false, { option: true }],
  lock: [null, { option: true }],
  cspViolations: ['fail', { option: true }],
  hydrationAware: [
    async ({ browser }, use) => {
      const newContext = browser.newContext.bind(browser);
      browser.newContext = async (options) => {
        const context = await newContext(options);
        context.on('page', awaitHydration);
        return context;
      };
      await use();
    },
    { scope: 'worker', auto: true },
  ],
  context: async ({ context }, use) => {
    context.on('page', awaitHydration);
    await use(context);
  },
  page: async ({ page, cspViolations }, use) => {
    const violations: string[] = [];
    page.on('console', (message) => {
      if (/Content Security Policy/i.test(message.text())) violations.push(`${page.url()}: ${message.text().slice(0, 300)}`);
    });
    await use(page);
    if (cspViolations === 'fail') expect(violations, 'content security policy violations').toEqual([]);
  },
  isolation: [
    async ({ siteWide, lock }, use) => {
      await db.begin(async (sql) => {
        if (siteWide) await sql`select pg_advisory_xact_lock(${SITE_WIDE_KEY})`;
        else await sql`select pg_advisory_xact_lock_shared(${SITE_WIDE_KEY})`;
        if (lock) await sql`select pg_advisory_xact_lock(${RESOURCE_SPACE}, hashtext(${lock}))`;
        await use();
      });
    },
    // A site-wide test may wait for the slowest test in flight.
    { auto: true, timeout: 300_000 },
  ],
});

export { expect };

const HYDRATED = 'html[data-hydrated]';
const patched = new WeakSet<Page>();

function awaitHydration(page: Page): void {
  if (patched.has(page)) return;
  patched.add(page);
  const settle = async (response: Response | null) => {
    if (response?.headers()['x-sveltekit-page']) await waitForHydration(page);
    return response;
  };
  const goto = page.goto.bind(page);
  const reload = page.reload.bind(page);
  page.goto = async (url, options) => settle(await goto(url, options));
  page.reload = async (options) => settle(await reload(options));
}

/** For a navigation goto() or reload() didn't make, such as a link that reloads the document. */
export async function waitForHydration(page: Page): Promise<void> {
  await page.locator(HYDRATED).waitFor({ state: 'attached', timeout: 15_000 });
}

/**
 * The Origin header SvelteKit's cross-site check requires on a form POST,
 * which a request context doesn't send: `page.request.post(url, { form, headers: sameOrigin() })`.
 */
export const sameOrigin = () => ({ origin: test.info().project.use.baseURL! });

/** A browser context without a session: an anonymous visitor. */
export const anonymous = (browser: Browser) => browser.newContext({ storageState: { cookies: [], origins: [] } });

/** The viewer's colour preference, as the theme switch sets it. */
export const setColorPref = (page: Page, baseURL: string, value: 'light' | 'dark') => page.context().addCookies([{ name: 'color_pref', value, url: baseURL }]);
