// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import type { APIRequestContext, Page } from '@playwright/test';
import { test, expect, waitForHydration } from '$tests/e2e/fixtures';
import { authState } from '$tests/e2e/seed-data';
import { unique, createPage, patchPage, createDocument } from '$tests/e2e/api';
import { doc, para } from '$tests/e2e/doc';
import { horizontalOverflow, touchTargets } from '$tests/e2e/responsive';

// Every test lists rows of its own, scoped by a tag or a term no other test
// uses. Pages made through the API start restricted, so each is opened to the
// audience the test views it as.

test.describe.configure({ mode: 'parallel' });

const results = (page: Page) => page.getByTestId('search-result');
const count = (page: Page) => page.getByTestId('search-count');
const titles = (page: Page) => results(page).getByRole('heading').allTextContents();

/** A word the full-text index keeps as one token, used by no other row. */
const word = () => `zq${Math.random().toString(36).slice(2, 8)}`;

async function listedPage(
  request: APIRequestContext,
  setup: { title: string; tags?: string[]; visibility?: 'public' | 'internal'; nodeClassId?: string; namespaceId?: string; body?: string }
): Promise<string> {
  const { id } = await createPage(request, { namespaceId: setup.namespaceId, doc: setup.body ? doc(para(setup.body)) : undefined });
  await patchPage(request, id, {
    title: setup.title,
    tags: setup.tags ?? [],
    visibility: setup.visibility ?? 'internal',
    ...(setup.nodeClassId ? { nodeClassId: setup.nodeClassId } : {}),
  });
  return id;
}

async function patchDocument(request: APIRequestContext, id: string, data: Record<string, unknown>): Promise<void> {
  expect((await request.patch(`/api/documents/${id}`, { data })).ok(), 'patch document').toBe(true);
}

test.describe('as an editor', () => {
  test.use({ storageState: authState('editorA') });

  test('pages through a long list, and Back returns to the page before', async ({ page }) => {
    const tag = unique('paged').slug;
    await Promise.all(Array.from({ length: 26 }, (_, i) => listedPage(page.request, { title: `Paged ${tag} ${String(i).padStart(2, '0')}`, tags: [tag] })));

    await page.goto(`/search?tag=${tag}`);
    await expect(count(page)).toHaveText(`26 results · tagged ${tag}`);
    await expect(results(page)).toHaveCount(24);
    await expect(page.getByText('Page 1 of 2')).toBeVisible();

    await page.getByRole('navigation', { name: 'Pages of results' }).getByRole('link', { name: 'Next' }).click();
    await expect(page).toHaveURL(/[?&]page=2(&|$)/);
    await expect(results(page)).toHaveCount(2);
    await expect(page.getByText('Page 2 of 2')).toBeVisible();

    await page.goBack();
    await expect(page).not.toHaveURL(/page=/);
    await expect(results(page)).toHaveCount(24);

    // A page past the end goes to the last one.
    await page.goto(`/search?tag=${tag}&page=99`);
    await expect(page).toHaveURL(/[?&]page=2(&|$)/);
    await expect(results(page)).toHaveCount(2);
  });

  test('switches between a list and a grid, and Back switches back', async ({ page }) => {
    const tag = unique('view').slug;
    await listedPage(page.request, { title: unique('Viewed').name, tags: [tag] });
    const list = page.getByRole('list', { name: 'Results' });
    const display = () => list.evaluate((el) => getComputedStyle(el).display);

    await page.goto(`/search?tag=${tag}`);
    expect(await display()).toBe('flex');
    await page.getByRole('radio', { name: 'Grid' }).click();
    await expect(page).toHaveURL(/[?&]view=grid(&|$)/);
    await expect.poll(display).toBe('grid');

    await page.goBack();
    await expect(page).not.toHaveURL(/view=/);
    await expect.poll(display).toBe('flex');
  });

  test('on a wide window the filters stay one inline row, and the field submits from its own icon', async ({ page }) => {
    const term = word();
    const title = `Breit ${term}`;
    await listedPage(page.request, { title });
    await page.goto('/search?view=grid');
    await expect(page.getByRole('group', { name: 'Filters' })).toBeVisible();
    // The phone's presentation is not shown.
    await expect(page.getByRole('button', { name: 'Filter', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Sort: / })).toHaveCount(0);
    // No separate Search button: the submit is the icon inside the field.
    const form = page.getByRole('search');
    await expect(form.locator('button', { hasText: 'Search' })).toHaveCount(0);
    await form.getByRole('searchbox', { name: 'Search term' }).fill(term);
    await form.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/search\\?q=${term}&view=grid$`));
    expect(await titles(page)).toEqual([title]);
  });

  test('the search overlay hands its term and type over to the page', async ({ page }) => {
    const term = word();
    const title = `Report ${term}`;
    const document = await createDocument(page.request, { title });
    await patchDocument(page.request, document.id, { visibility: 'internal' });
    await listedPage(page.request, { title: `Page ${term}` });

    await page.goto('/');
    await page.keyboard.press('Control+k');
    const dialog = page.getByRole('dialog', { name: 'Search' });
    await dialog.getByPlaceholder('Search…').fill(term);
    await dialog.getByRole('radio', { name: 'Documents' }).click();
    await expect(dialog.getByRole('option').filter({ hasText: title })).toBeVisible();
    await dialog.getByRole('option', { name: 'Show all results' }).click();

    await expect(page).toHaveURL(new RegExp(`/search\\?q=${term}&type=document$`));
    await expect(page.getByRole('searchbox', { name: 'Search term' })).toHaveValue(term);
    await expect(page.getByRole('combobox', { name: 'Type' })).toContainText('Document');
    expect(await titles(page)).toEqual([title]);
    await expect(count(page)).toHaveText(`1 document for “${term}”`);
  });

  test('with nothing found, Enter in the overlay still hands the term over', async ({ page }) => {
    const term = word();
    await page.goto('/');
    await page.keyboard.press('Control+k');
    const dialog = page.getByRole('dialog', { name: 'Search' });
    await dialog.getByPlaceholder('Search…').fill(term);
    await expect(dialog.getByText(`No results match "${term}".`)).toBeVisible();
    await expect(dialog.getByRole('option', { name: 'Show all results' })).toHaveAttribute('data-selected', '');
    await page.keyboard.press('Enter');

    await expect(page).toHaveURL(new RegExp(`/search\\?q=${term}$`));
    await expect(results(page)).toHaveCount(0);
    await expect(page.getByText('Nothing matches these filters.')).toBeVisible();
  });

  test("the overlay's footer opens the search page, before anything is typed and with the term and type so far", async ({ page }) => {
    const dialog = page.getByRole('dialog', { name: 'Search' });
    await page.goto('/');
    await page.keyboard.press('Control+k');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('link', { name: 'Advanced search' }).click();
    await expect(page).toHaveURL(/\/search$/);
    await expect(dialog).toBeHidden();

    // From a route under the other style policy (the settings), the way
    // there is a full navigation.
    const term = word();
    const title = `Memo ${term}`;
    const document = await createDocument(page.request, { title });
    await patchDocument(page.request, document.id, { visibility: 'internal' });
    await page.goto('/settings/profile');
    await page.keyboard.press('Control+k');
    await dialog.getByPlaceholder('Search…').fill(term);
    await dialog.getByRole('radio', { name: 'Documents' }).click();
    await expect(dialog.getByRole('option').filter({ hasText: title })).toBeVisible();
    await dialog.getByRole('link', { name: 'Advanced search' }).click();
    await expect(page).toHaveURL(new RegExp(`/search\\?q=${term}&type=document$`));
    await waitForHydration(page);
    await expect(page.getByRole('searchbox', { name: 'Search term' })).toHaveValue(term);
    await expect(page.getByRole('combobox', { name: 'Type' })).toContainText('Document');
    expect(await titles(page)).toEqual([title]);
  });

  test("in a grid, a row's cards are one height, their feet line up, and a long excerpt is cut to four lines", async ({ page }) => {
    const tag = unique('rows').slug;
    const long = Array.from({ length: 8 }, () => 'This sentence makes the lead text run well past what four lines of a card can hold.').join(' ');
    await listedPage(page.request, { title: unique('Row long').name, tags: [tag], body: long });
    await listedPage(page.request, { title: unique('Row short').name, tags: [tag], body: 'A short body.' });
    await listedPage(page.request, { title: unique('Row empty').name, tags: [tag] });

    // Three columns of about 300px: narrow enough that the lead text needs
    // more than four lines.
    await page.setViewportSize({ width: 1000, height: 900 });
    await page.goto(`/search?tag=${tag}&view=grid`);
    await expect(results(page)).toHaveCount(3);
    const cards = await Promise.all([0, 1, 2].map(async (i) => (await results(page).nth(i).boundingBox())!));
    const feet = await Promise.all([0, 1, 2].map(async (i) => (await results(page).nth(i).getByText(/^Updated /).boundingBox())!));
    for (const [i, card] of cards.entries()) {
      expect(Math.abs(card.y - cards[0].y), `card ${i} sits in the first row`).toBeLessThanOrEqual(1);
      expect(Math.abs(card.height - cards[0].height), `card ${i} is the row's height`).toBeLessThanOrEqual(1);
      expect(Math.abs(feet[i].y + feet[i].height - (feet[0].y + feet[0].height)), `card ${i}'s foot lines up`).toBeLessThanOrEqual(1);
    }

    const excerpt = results(page).filter({ hasText: 'Row long' }).getByText(/^This sentence makes/);
    const box = await excerpt.evaluate((el) => ({ height: el.getBoundingClientRect().height, line: parseFloat(getComputedStyle(el).lineHeight), cut: el.scrollHeight > el.clientHeight + 1 }));
    expect(box.height).toBeLessThanOrEqual(box.line * 4 + 1);
    expect(box.cut, 'the excerpt holds more than four lines show').toBe(true);
  });
});

test.describe('on a phone, by touch', () => {
  test.use({ storageState: authState('editorA'), locale: 'de-DE', hasTouch: true, viewport: { width: 390, height: 844 } });

  test('the filters, the cards and the pagination fit, and every control is a finger-sized target', async ({ page }) => {
    const tag = unique('phone').slug;
    await Promise.all(
      Array.from({ length: 25 }, (_, i) =>
        listedPage(page.request, { title: `Ein recht langer Seitentitel für die Suche ${i}`, tags: [tag], body: 'Etwas Text, der als Anriss erscheint.' })
      )
    );
    for (const width of [360, 390, 768]) {
      await page.setViewportSize({ width, height: 844 });
      for (const view of ['list', 'grid']) {
        await page.goto(`/search?tag=${tag}&view=${view}`);
        await expect(results(page)).toHaveCount(24);
        await expect.poll(() => horizontalOverflow(page), { message: `${view} at ${width}px: overflow` }).toEqual([]);
        await expect.poll(() => touchTargets(page, 'main'), { message: `${view} at ${width}px: touch targets` }).toEqual([]);
      }
    }
  });
});

// In German, whose labels are the longer ones.
for (const width of [360, 390]) {
  test.describe(`on a phone ${width}px wide: the compact filters`, () => {
    test.use({ storageState: authState('editorA'), locale: 'de-DE', viewport: { width, height: 844 } });

    const filterButton = (page: Page, n: number) => page.getByRole('button', { name: n ? `Filter · ${n}` : 'Filter', exact: true });
    const sheet = (page: Page) => page.getByRole('dialog', { name: 'Filter' });
    const countResponse = (page: Page, has: (url: URL) => boolean) =>
      page.waitForResponse((res) => {
        const url = new URL(res.url());
        return url.pathname === '/api/search-count' && has(url);
      });

    test('a chip takes its filter away, and many chips scroll inside their row', async ({ page }) => {
      const [a, b] = [unique('chipa').slug, unique('chipb').slug];
      await listedPage(page.request, { title: unique('Chips').name, tags: [a, b] });
      await page.goto(`/search?tag=${a}&tag=${b}&type=page`);
      const chips = page.getByRole('list', { name: 'Aktive Filter' });
      await expect(chips.getByRole('listitem')).toHaveCount(3);
      await chips.getByRole('button', { name: `Filter entfernen: ${b}` }).click();
      await expect(page).toHaveURL(new RegExp(`/search\\?tag=${a}&type=page$`));
      await expect(chips.getByRole('listitem')).toHaveCount(2);
      // Focus stays in the row: on the chip now in its place.
      await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? '')).toMatch(/^Filter entfernen: /);

      const many = Array.from({ length: 5 }, (_, i) => unique(`langerfiltername${i}`).slug);
      await listedPage(page.request, { title: unique('Viele Chips').name, tags: many });
      await page.goto(`/search?${many.map((t) => `tag=${t}`).join('&')}`);
      await expect(chips.getByRole('listitem')).toHaveCount(5);
      expect(await chips.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
      await expect.poll(() => horizontalOverflow(page)).toEqual([]);
    });

    test('the compact row is one line, and the first result shows without scrolling', async ({ page }) => {
      const tag = unique('firstcard').slug;
      await Promise.all([0, 1, 2].map((i) => listedPage(page.request, { title: unique(`Erstes ${i}`).name, tags: [tag], body: 'Ein Anriss, damit die Karte so hoch ist wie sonst auch.' })));
      await page.goto(`/search?tag=${tag}&type=page`);
      await expect(results(page)).toHaveCount(3);

      const filter = (await filterButton(page, 2).boundingBox())!;
      const view = (await page.getByRole('button', { name: 'Als Raster anzeigen' }).boundingBox())!;
      expect(Math.abs(filter.y - view.y), 'the Filter and view buttons share one line').toBeLessThanOrEqual(1);
      const field = (await page.getByRole('searchbox', { name: 'Suchbegriff' }).boundingBox())!;
      const line = (await count(page).boundingBox())!;
      expect(line.y - (field.y + field.height), 'the count line follows within one row of the field').toBeLessThanOrEqual(filter.height + 2 * 16 + 1);

      const first = (await results(page).first().boundingBox())!;
      const bar = (await page.getByRole('navigation', { name: 'Hauptnavigation' }).boundingBox())!;
      expect(first.y).toBeGreaterThanOrEqual(0);
      expect(first.y + first.height, 'the first card ends above the bottom bar').toBeLessThanOrEqual(bar.y);
    });
  });
}

test.describe('on a phone, by touch: the compact filters', () => {
  test.use({ storageState: authState('editorA'), locale: 'de-DE', hasTouch: true, viewport: { width: 390, height: 844 } });

  test('the row, the chips and the open sheet are finger-sized, and the field takes 16px text', async ({ page }) => {
    const tag = unique('touchsheet').slug;
    await listedPage(page.request, { title: unique('Fingerbreit').name, tags: [tag] });
    await page.goto(`/search?tag=${tag}&type=page`);
    await expect.poll(() => touchTargets(page, 'main')).toEqual([]);
    expect(await page.getByRole('searchbox', { name: 'Suchbegriff' }).evaluate((el) => getComputedStyle(el).fontSize)).toBe('16px');

    await page.getByRole('button', { name: 'Filter · 2', exact: true }).tap();
    await expect(page.getByRole('dialog', { name: 'Filter' })).toBeVisible();
    await expect.poll(() => touchTargets(page, '[role="dialog"]')).toEqual([]);
  });
});
