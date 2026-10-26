// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import type { Page } from '@playwright/test';
import { test, expect } from '$tests/e2e/fixtures';
import { authState } from '$tests/e2e/seed-data';
import { createPage } from '$tests/e2e/api';
import { doc, para, cell } from '$tests/e2e/doc';
import { blockSettings } from '$tests/e2e/editor';

const wideGrid = {
  type: 'grid',
  attrs: { blockId: 'band', width: 'wide', columnWidths: [1] },
  content: [cell(para('inside band'))],
};

const widthOf = (page: Page, blockId: string) => page.locator(`[data-block-id="${blockId}"]`).first().evaluate((el) => Math.round(el.getBoundingClientRect().width));
const bgOf = (page: Page, selector: string) => page.locator(selector).first().evaluate((el) => getComputedStyle(el).backgroundColor);

const WHITE = 'rgb(255, 255, 255)';

/** The blocks container's insets: its top padding and its side gutter, px. */
const blocksBox = (page: Page) =>
  page.locator('article.page-canvas .canvas-blocks').evaluate((el) => {
    const s = getComputedStyle(el);
    return { top: parseFloat(s.paddingTop), gutter: parseFloat(s.paddingLeft) };
  });
const overflows = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);

test.describe('page settings', () => {
  test.use({ storageState: authState('admin'), viewport: { width: 1280, height: 900 } });

  test('a page with no settings renders on the site widths and carries no canvas rule', async ({ page }) => {
    const { slug } = await createPage(page.request, { doc: doc(para('lead'), wideGrid) });
    await page.goto(`/${slug}`);
    await expect(page.getByText('lead')).toBeVisible();
    expect(await widthOf(page, 'lead')).toBe(760);
    expect(await widthOf(page, 'band')).toBe(1200);
    await expect(page.locator('article.page-canvas')).not.toHaveAttribute('data-b');
    await expect(page.locator('main.canvas-route')).not.toHaveAttribute('data-b');
    expect(await bgOf(page, 'article.page-canvas')).toBe(WHITE);
    // No seam: the reading area around a capped canvas paints the same ground.
    expect(await bgOf(page, 'main.canvas-route')).toBe(WHITE);
  });

  test('the gutter and the top padding follow the canvas tier, with no overflow', async ({ page }) => {
    const { slug } = await createPage(page.request, { doc: doc(para('lead'), wideGrid) });
    await page.goto(`/${slug}`);
    await expect(page.getByText('lead')).toBeVisible();
    for (const [width, gutter, top, lead] of [[1280, 40, 64, 760], [800, 24, 48, 752], [390, 16, 32, 358]] as const) {
      await page.setViewportSize({ width, height: 900 });
      await expect.poll(() => blocksBox(page).then((b) => b.top), { message: `${width}` }).toBe(top);
      const box = await blocksBox(page);
      expect(box.gutter, `${width}`).toBe(gutter);
      expect(await widthOf(page, 'lead'), `${width}`).toBe(lead);
      expect(await overflows(page), `${width}`).toBe(false);
    }
  });

  test("a page's own gutter replaces only the tier it sets", async ({ page }) => {
    const { slug } = await createPage(page.request, { doc: { type: 'doc', attrs: { layout: { gutters: { phone: '8px' } } }, content: [para('lead')] } });
    await page.goto(`/${slug}`);
    await expect(page.getByText('lead')).toBeVisible();
    await page.setViewportSize({ width: 390, height: 900 });
    await expect.poll(() => blocksBox(page).then((b) => b.gutter)).toBe(8);
    expect(await widthOf(page, 'lead')).toBe(374);
    await page.setViewportSize({ width: 800, height: 900 });
    await expect.poll(() => blocksBox(page).then((b) => b.gutter)).toBe(24);
  });

  test('a full band bleeds to the canvas edge and insets its content by the gutter, on the page and in the editor', async ({ page }) => {
    const band = {
      type: 'grid',
      attrs: { blockId: 'band', width: 'full', bleedToTop: true, columnWidths: [1], surface: { desktop: { bg: 'token:subtle' } } },
      content: [cell(para('in the band'))],
    };
    const { slug } = await createPage(page.request, { doc: doc(band, para('after')) });
    await page.goto(`/${slug}`);
    await expect(page.getByText('in the band')).toBeVisible();
    for (const [width, gutter] of [[1280, 40], [390, 16]] as const) {
      await page.setViewportSize({ width, height: 900 });
      await expect.poll(() => blocksBox(page).then((b) => b.gutter)).toBe(gutter);
      const geo = await page.evaluate(() => {
        const canvas = document.querySelector('article.page-canvas')!.getBoundingClientRect();
        // The block (its wrapper) bleeds; the row inside it carries the padding.
        const bandEl = document.querySelector('[data-block-id="band"]')!;
        const b = bandEl.getBoundingClientRect();
        return { left: b.left - canvas.left, right: canvas.right - b.right, top: b.top - canvas.top, pad: getComputedStyle(bandEl.querySelector(':scope > .grid')!).paddingLeft };
      });
      // Bleeds sideways and, as the page's first block, to the top.
      expect(geo, `${width}`).toEqual({ left: 0, right: 0, top: 0, pad: `${gutter}px` });
      expect(await overflows(page), `${width}`).toBe(false);
    }

    // The editor pads the band with the same gutter its own canvas uses.
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/${slug}/edit`);
    await expect(page.getByText('in the band')).toBeVisible();
    const editor = await page.evaluate(() => ({
      gutter: getComputedStyle(document.querySelector('.editor .ProseMirror')!).paddingLeft,
      band: getComputedStyle(document.querySelector('.editor [data-block-id="band"] .grid')!).paddingLeft,
    }));
    expect(editor.band).toBe(editor.gutter);
  });

  test("the editor's tablet and phone previews take the same tiers as a device", async ({ page }) => {
    const { slug } = await createPage(page.request, { doc: doc(para('lead')) });
    await page.goto(`/${slug}/edit`);
    await expect(page.getByText('lead')).toBeVisible();
    const insets = () =>
      page.locator('.editor .ProseMirror').evaluate((el) => {
        const s = getComputedStyle(el);
        return `${s.paddingTop} ${s.paddingLeft}`;
      });
    await page.getByRole('radio', { name: 'Tablet preview' }).click();
    await expect.poll(insets).toBe('48px 24px');
    await page.getByRole('radio', { name: 'Phone preview' }).click();
    await expect.poll(insets).toBe('32px 16px');
  });

  test('its own widths and background reach the page, the share link and the editor alike', async ({ page, browser }) => {
    const { id, slug } = await createPage(page.request, {
      doc: {
        type: 'doc',
        attrs: { layout: { widths: { desktop: { read: '600px', wide: '900px' } } }, surface: { desktop: { bg: 'token:subtle' } } },
        content: [para('lead'), wideGrid],
      },
    });

    const expectLayout = async (p: Page, label: string) => {
      await expect(p.getByText('lead')).toBeVisible();
      expect(await widthOf(p, 'lead'), label).toBe(600);
      expect(await widthOf(p, 'band'), label).toBe(900);
    };

    await page.goto(`/${slug}`);
    await expectLayout(page, 'page');
    const tint = await bgOf(page, 'article.page-canvas');
    expect(tint).not.toBe(WHITE);
    // The whole reading area takes the page's ground, not just the canvas.
    expect(await bgOf(page, 'main.canvas-route')).toBe(tint);

    const link = await (await page.request.post(`/api/pages/${id}/share-links`, { data: { label: 'page layout' } })).json();
    const anon = await browser.newContext({ storageState: { cookies: [], origins: [] }, viewport: { width: 1280, height: 900 } });
    try {
      const anonPage = await anon.newPage();
      await anonPage.goto(`/share/${link.token}`);
      await expectLayout(anonPage, 'share');
      expect(await bgOf(anonPage, 'main.canvas-route')).toBe(tint);
    } finally {
      await anon.close();
    }

    await page.goto(`/${slug}/edit`);
    await expectLayout(page, 'editor');
    expect(await bgOf(page, '.editor.page-canvas')).toBe(tint);
  });

  test('the block settings panel sets and clears the page settings, and Auto stores nothing', async ({ page }) => {
    const { slug } = await createPage(page.request, { doc: doc(para('lead'), wideGrid) });
    await page.goto(`/${slug}/edit`);
    await page.getByText('lead').click();
    const breadcrumb = page.getByRole('navigation', { name: 'Block ancestry' });
    await breadcrumb.getByRole('button', { name: 'Page', exact: true }).click();

    const panel = blockSettings(page);
    const reading = panel.getByRole('group', { name: 'Reading width' });
    await expect(reading.getByText('Auto · 760 px')).toBeVisible();
    await reading.getByRole('radio', { name: 'Custom' }).click();
    const value = reading.getByRole('spinbutton', { name: 'Reading width, value' });
    await expect(value).toHaveValue('760');
    await value.fill('640');
    await value.press('Tab');
    await expect.poll(() => widthOf(page, 'lead')).toBe(640);

    await panel.getByRole('button', { name: 'Background', exact: true }).click();
    await page.getByRole('button', { name: 'Subtle background' }).click();
    await page.keyboard.press('Escape');
    await expect.poll(() => bgOf(page, '.editor.page-canvas')).not.toBe(WHITE);

    // The gutter at the edited viewport (desktop): S is 16 px, Auto was the site's 40.
    const margin = panel.getByRole('group', { name: 'Page margin' });
    await expect(margin.getByText('Auto · 40 px')).toBeVisible();
    await margin.getByRole('radio', { name: 'S', exact: true }).click();

    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Saved')).toBeVisible({ timeout: 15000 });

    await page.goto(`/${slug}`);
    await expect(page.getByText('lead')).toBeVisible();
    expect(await widthOf(page, 'lead')).toBe(640);
    expect((await blocksBox(page)).gutter).toBe(16);
    expect(await widthOf(page, 'band')).toBe(1200);
    const tint = await bgOf(page, 'article.page-canvas');
    expect(tint).not.toBe(WHITE);
    expect(await bgOf(page, 'main.canvas-route')).toBe(tint);

    // Back to Auto: nothing of the page's own is left in the doc.
    await page.goto(`/${slug}/edit`);
    await page.getByText('lead').click();
    await breadcrumb.getByRole('button', { name: 'Page', exact: true }).click();
    // Layout's reset (the widths) and Spacing's (the gutter at this tier).
    const resets = panel.getByRole('button', { name: 'All to Auto' });
    await expect(resets).toHaveCount(2);
    await resets.first().click();
    await expect(resets).toHaveCount(1);
    await resets.first().click();
    await expect(resets).toHaveCount(0);
    await panel.getByRole('button', { name: 'Background', exact: true }).click();
    await page.getByRole('button', { name: "The theme's page background" }).click();
    await page.keyboard.press('Escape');
    await expect.poll(() => widthOf(page, 'lead')).toBe(760);
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Saved')).toBeVisible({ timeout: 15000 });
    // Nothing of the page's own reaches the page: no canvas rule, no ground.
    await page.goto(`/${slug}`);
    await expect(page.getByText('lead')).toBeVisible();
    expect(await widthOf(page, 'lead')).toBe(760);
    await expect(page.locator('article.page-canvas')).not.toHaveAttribute('data-b');
    await expect(page.locator('main.canvas-route')).not.toHaveAttribute('data-b');
  });
});
