// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import type { Page } from '@playwright/test';
import { test, expect } from '$tests/e2e/fixtures';
import { authState, seed } from '$tests/e2e/seed-data';
import { createDocument, createPage, patchPage, unique, uploadImage } from '$tests/e2e/api';
import { seedProbePage } from '$tests/e2e/probe-doc';
import { horizontalOverflow, layoutFingerprint } from '$tests/e2e/responsive';
import { articleDoc, landingDoc, tablesDoc, LONG_URL, LONG_WORD } from '$tests/e2e/responsive-probe';

// The responsive guardrail (docs/architecture/responsive.md), in German, whose words and
// labels are the longer ones.

const WIDTHS = [360, 390, 768] as const;

async function expectNoOverflowAt(page: Page, path: string) {
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    if (width === WIDTHS[0]) await page.goto(path);
    await expect.poll(() => horizontalOverflow(page), { message: `${path} at ${width}px` }).toEqual([]);
  }
}

// How the probe pages' containers fall at a phone and a tablet. A change here
// is a change of the layout policy (docs/architecture/responsive.md) — make it on purpose.
const LANDING = {
  390: {
    hero: 'grid 1 tracks 1x1',
    'hero-buttons': 'flex row/wrap 2x1',
    'cards-flex': 'flex row/wrap 2x2',
    'cards-grid': 'grid 1 tracks 3x1',
    'icon-grid': 'grid 2 tracks 2x2',
    'icon-row': 'flex row/nowrap 1x2',
    stats: 'grid 2 tracks 2x2',
    logos: 'flex row/nowrap 1x6',
    cta: 'flex row/wrap 2x1',
  },
  768: {
    hero: 'grid 1 tracks 1x1',
    'hero-buttons': 'flex row/wrap 1x2',
    'cards-flex': 'flex row/wrap 1x3',
    'cards-grid': 'grid 3 tracks 1x3',
    'icon-grid': 'grid 2 tracks 2x2',
    'icon-row': 'flex row/nowrap 1x2',
    stats: 'grid 4 tracks 1x4',
    logos: 'flex row/nowrap 1x6',
    cta: 'flex row/wrap 1x2',
  },
};
const ARTICLE = {
  390: {
    'art-title': 'section 1 tracks 1x1',
    'art-main': 'section 1 tracks 2x1',
    'art-detail': 'section 1 tracks 2x1',
    'art-figure': 'image 1.78',
    'art-band': 'section 1 tracks 1x1',
    'art-table': 'section 1 tracks 2x1',
  },
  768: {
    'art-title': 'section 1 tracks 1x1',
    'art-main': 'section 2 tracks 1x2',
    'art-detail': 'section 2 tracks 1x2',
    'art-figure': 'image 1.78',
    'art-band': 'section 1 tracks 1x1',
    'art-table': 'section 2 tracks 1x2',
  },
};

async function expectFingerprint(page: Page, root: string, expected: Record<string, string>, label: string) {
  await expect
    .poll(async () => {
      const all = await layoutFingerprint(page, root);
      return Object.fromEntries(Object.keys(expected).map((id) => [id, all[id] ?? 'missing']));
    }, { message: label })
    .toEqual(expected);
}

test.describe('responsive guardrail', () => {
  test.describe.configure({ mode: 'parallel' });
  test.use({ storageState: authState('editorA'), locale: 'de-DE' });

  test('an article with notes beside its paragraphs, long words, a figure and a table', async ({ page }) => {
    const { id, slug } = await createPage(page.request);
    const figure = await uploadImage(page.request, id);
    expect((await page.request.put(`/api/pages/${id}`, { data: articleDoc(figure.id) })).ok(), 'save the page').toBe(true);
    await expectNoOverflowAt(page, `/${slug}`);
    for (const width of [390, 768] as const) {
      await page.setViewportSize({ width, height: 900 });
      await expectFingerprint(page, '.canvas-blocks', ARTICLE[width], `article at ${width}px`);
    }
  });

  test('a landing page: hero, card rows, icon rows, a stats band, a logo strip, authored HTML', async ({ page }) => {
    const { slug } = await createPage(page.request, { doc: landingDoc() });
    await expectNoOverflowAt(page, `/${slug}`);
    for (const width of [390, 768] as const) {
      await page.setViewportSize({ width, height: 900 });
      await expectFingerprint(page, '.canvas-blocks', LANDING[width], `landing at ${width}px`);
    }
  });

  test('tables scroll in their block, and query results with a long title wrap', async ({ page }) => {
    const value = unique('responsive').slug;
    const { id: titled } = await createPage(page.request, { title: `Ergebnis ${LONG_WORD}` });
    await patchPage(page.request, titled, { properties: [{ name: seed.propStatus, value }] });
    const { slug } = await createPage(page.request, { doc: tablesDoc(seed.propStatus, value) });
    await expectNoOverflowAt(page, `/${slug}`);
    await expect(page.getByText(`Ergebnis ${LONG_WORD}`)).toBeVisible();
    // On a phone the wide table keeps readable columns and scrolls in its block.
    await page.setViewportSize({ width: 390, height: 900 });
    const wide = await page.locator('[data-block-id="wide-table"]').evaluate((block) => {
      const cells = [...block.querySelectorAll('tr:first-child > *')].map((c) => c.getBoundingClientRect().width);
      return { scrolls: block.scrollWidth > block.clientWidth, narrowest: Math.min(...cells) };
    });
    expect(wide.scrolls).toBe(true);
    // Its narrowest column is 6.5rem (104px), not a squeezed share of the phone.
    expect(wide.narrowest).toBeGreaterThanOrEqual(100);
  });

  // Scroll cues (docs/architecture/responsive.md): the box fades its end while more waits
  // there and its start once it has moved; a box that fits fades nothing.
  test('a block that scrolls sideways fades the edge where more of it waits', async ({ page }) => {
    const { slug } = await createPage(page.request, { doc: tablesDoc(seed.propStatus, unique('cue').slug) });
    const fades = (id: string) =>
      page.locator(`[data-block-id="${id}"]`).evaluate((el) => {
        const cs = getComputedStyle(el);
        return { start: cs.getPropertyValue('--scroll-cue-start'), end: cs.getPropertyValue('--scroll-cue-end') };
      });
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto(`/${slug}`);
    await expect.poll(() => fades('wide-table')).toEqual({ start: '0px', end: '32px' });
    await expect.poll(() => fades('small-table')).toEqual({ start: '0px', end: '0px' });
    await page.locator('[data-block-id="wide-table"]').evaluate((el) => (el.scrollLeft = el.scrollWidth));
    await expect.poll(() => fades('wide-table')).toEqual({ start: '32px', end: '0px' });
  });

  test('a page with every block kind', async ({ page }) => {
    const { slug } = await seedProbePage(page.request);
    await expectNoOverflowAt(page, `/${slug}`);
  });

  test('a document with a long title', async ({ page }) => {
    const { slug } = await createDocument(page.request, { title: `Dokument ${LONG_WORD} ${unique('d').slug}` });
    await expectNoOverflowAt(page, `/${slug}`);
  });

  test('a share link', async ({ page, browser }) => {
    const { id } = await createPage(page.request, { doc: { type: 'doc', content: [{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: LONG_WORD }] }, { type: 'paragraph', content: [{ type: 'text', text: LONG_URL }] }] } });
    const res = await page.request.post(`/api/pages/${id}/share-links`, { data: {} });
    expect(res.ok(), 'create a share link').toBe(true);
    const { token } = (await res.json()) as { token: string };
    const anon = await browser.newContext({ storageState: { cookies: [], origins: [] }, locale: 'de-DE' });
    const reader = await anon.newPage();
    await expectNoOverflowAt(reader, `/share/${token}`);
    await anon.close();
  });

  test('the editor on a phone: no overflow, and it collapses like the page', async ({ page }) => {
    const { slug } = await createPage(page.request, { doc: landingDoc() });
    for (const width of [360, 390] as const) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/${slug}`);
      const published = await layoutFingerprint(page, '.canvas-blocks');
      await page.goto(`/${slug}/edit`);
      await expect(page.locator('.ProseMirror [data-block-id="cards-grid"]')).toBeVisible();
      await expect.poll(() => horizontalOverflow(page), { message: `editor at ${width}px` }).toEqual([]);
      await expectFingerprint(page, '.ProseMirror', published, `phone editor at ${width}px`);
    }
  });

  test("the desktop editor's previews collapse like the page, and a tablet's editor fits", async ({ page }) => {
    const { slug } = await createPage(page.request, { doc: landingDoc() });
    const published: Record<number, Record<string, string>> = {};
    for (const width of [390, 820]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/${slug}`);
      published[width] = await layoutFingerprint(page, '.canvas-blocks');
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/${slug}/edit`);
    await expect(page.locator('.ProseMirror [data-block-id="cards-grid"]')).toBeVisible();
    await page.getByRole('radio', { name: 'Telefon-Vorschau' }).click();
    await expectFingerprint(page, '.ProseMirror', published[390], 'phone preview');
    await page.getByRole('radio', { name: 'Tablet-Vorschau' }).click();
    await expectFingerprint(page, '.ProseMirror', published[820], 'tablet preview');
    await page.setViewportSize({ width: 768, height: 1024 });
    await expect.poll(() => horizontalOverflow(page), { message: 'editor at 768px' }).toEqual([]);
  });
});

test.describe('responsive guardrail: the home page', () => {
  test.use({ storageState: authState('editorA'), locale: 'de-DE', lock: 'home' });

  test('lists a page whose title is one long word without widening', async ({ page }) => {
    await createPage(page.request, { title: `${LONG_WORD} ${unique('home').slug}` });
    await expectNoOverflowAt(page, '/');
  });
});

test.describe('responsive guardrail: the About page', () => {
  test.use({ storageState: { cookies: [], origins: [] }, locale: 'de-DE' });

  test('/-/about fits a phone and a tablet, its row of actions wrapping', async ({ page }) => {
    await expectNoOverflowAt(page, '/-/about');
  });
});

test.describe('responsive guardrail: settings', () => {
  test.describe.configure({ mode: 'parallel' });
  test.use({ storageState: authState('admin'), locale: 'de-DE' });

  for (const path of ['/settings', '/settings/branding', '/settings/users', '/settings/schema/properties']) {
    test(`${path} fits a phone and a tablet`, async ({ page }) => {
      await expectNoOverflowAt(page, path);
    });
  }
});

test.describe('responsive guardrail: the graph', () => {
  test.use({ storageState: authState('admin'), locale: 'de-DE' });

  test('/graph with its settings open fits a phone (a sheet) and a tablet (the panel)', async ({ page }) => {
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/graph');
      await page.getByRole('button', { name: 'Anzeigeoptionen', exact: true }).click();
      await expect(page.getByRole(width <= 640 ? 'dialog' : 'group', { name: 'Anzeigeoptionen' })).toBeVisible();
      await expect.poll(() => horizontalOverflow(page), { message: `/graph with settings at ${width}px` }).toEqual([]);
    }
  });
});
