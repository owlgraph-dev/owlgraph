// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import type { Locator, Page } from '@playwright/test';
import { test, expect } from '$tests/e2e/fixtures';
import { authState } from '$tests/e2e/seed-data';
import { createPage, unique } from '$tests/e2e/api';
import { doc, para, txt } from '$tests/e2e/doc';

// The document is the app's scroller, so SvelteKit's own scroll handling does
// all of this (docs/architecture/responsive.md, "What scrolls").

const VIEWPORTS = [
  { name: 'desktop', use: { viewport: { width: 1280, height: 640 } } },
  { name: 'phone', use: { viewport: { width: 390, height: 700 }, hasTouch: true } },
];

const paras = (prefix: string, count: number) => Array.from({ length: count }, (_, i) => para(`${prefix} ${i + 1}`));
const block = (page: Page, id: string) => page.locator(`[data-block-id="${id}"]`);

const topOf = (target: Locator) => target.evaluate((el) => Math.round(el.getBoundingClientRect().top));

/** Two long pages; the first ends in a link to the second. */
async function seedPages(page: Page) {
  const second = await createPage(page.request, { doc: doc(...paras('Second', 40)) });
  const link = { type: 'link', attrs: { href: `/${second.slug}` } };
  const first = await createPage(page.request, {
    doc: doc(...paras('First', 40), { type: 'paragraph', attrs: { blockId: 'to-second' }, content: [txt('Go to the second page', [link])] }),
  });
  return { first, second };
}

for (const { name, use } of VIEWPORTS) {
  test.describe(`navigation scroll — ${name}`, () => {
    test.describe.configure({ mode: 'parallel' });
    test.use({ storageState: authState('editorA'), ...use });

    test('a link opens the next page at its top', async ({ page }) => {
      const { first } = await seedPages(page);
      await page.goto(`/${first.slug}`);
      const link = page.getByRole('link', { name: 'Go to the second page' });
      await link.scrollIntoViewIfNeeded();
      await expect(block(page, 'First 1')).not.toBeInViewport();

      await link.click();
      await expect(block(page, 'Second 1')).toBeInViewport();
      await expect(block(page, 'Second 40')).not.toBeInViewport();
    });

    test('back and forward return to where the reader was on each page', async ({ page }) => {
      const { first } = await seedPages(page);
      await page.goto(`/${first.slug}`);
      // Brought into view before it is clicked, so the click scrolls nothing
      // more: where the page is now is where the reader left it.
      const link = page.getByRole('link', { name: 'Go to the second page' });
      await link.scrollIntoViewIfNeeded();
      const firstTop = await topOf(block(page, 'First 30'));

      await link.click();
      await expect(block(page, 'Second 1')).toBeInViewport();
      await block(page, 'Second 30').scrollIntoViewIfNeeded();
      const secondTop = await topOf(block(page, 'Second 30'));

      await page.goBack();
      await expect(block(page, 'First 30')).toBeVisible();
      await expect.poll(() => topOf(block(page, 'First 30'))).toBe(firstTop);

      await page.goForward();
      await expect(block(page, 'Second 30')).toBeVisible();
      await expect.poll(() => topOf(block(page, 'Second 30'))).toBe(secondTop);
    });

    test('a page shorter than the screen does not scroll', async ({ page }) => {
      // The shell fills the screen exactly; nothing hidden after it (a live
      // region, an announcer) may hang below and give the document a scroll.
      const { slug } = await createPage(page.request, { doc: doc(para('A short page')) });
      await page.goto(`/${slug}`);
      const overflow = await page.evaluate(() => document.documentElement.scrollHeight - document.documentElement.clientHeight);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  });

  test.describe(`navigation scroll to an anchor — ${name}`, () => {
    // The sanitizer drops element ids from page content, so the anchor is a
    // settings field. A short screen puts it below the fold, with room to
    // scroll it all the way up.
    test.use({ storageState: authState('admin'), ...use, viewport: { width: use.viewport.width, height: 400 } });

    test('a link to an anchor brings it up under the bars, not behind them', async ({ page }) => {
      // The footer's page pickers list recent pages after the scroll: a picker
      // scrolling its first row into view would carry the page past the anchor
      // (Command's disableInitialScroll).
      await createPage(page.request);
      await page.goto('/settings/profile');
      const { name: label } = unique('Jump to the legal text');
      await page.locator('.settings-pane').evaluate((pane, text) => {
        const a = document.createElement('a');
        a.href = '/settings/footer#footer-legal-text';
        a.textContent = text;
        pane.prepend(a);
      }, label);

      await page.getByRole('link', { name: label }).click();
      await expect(page).toHaveURL(/\/settings\/footer#footer-legal-text$/);
      const target = page.locator('#footer-legal-text');
      await expect(target).toBeInViewport();
      // The anchor was below the fold: the page scrolled to it.
      await expect(page.getByRole('heading', { level: 1 })).not.toBeInViewport();

      // Nothing fixed or sticky covers its top edge or its centre.
      const covered = await target.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const hit = (y: number) => document.elementFromPoint(r.left + r.width / 2, y);
        return [r.top + 2, r.top + r.height / 2].filter((y) => !el.contains(hit(y))).map((y) => `${Math.round(y)}px: ${hit(y)?.className}`);
      });
      expect(covered).toEqual([]);
    });
  });
}
