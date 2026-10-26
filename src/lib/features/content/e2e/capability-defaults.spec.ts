// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import type { Page } from '@playwright/test';
import { test, expect, sameOrigin } from '$tests/e2e/fixtures';
import { authState } from '$tests/e2e/seed-data';
import { createPage } from '$tests/e2e/api';
import { doc, para } from '$tests/e2e/doc';
import { blockSettings } from '$tests/e2e/editor';

const grid = (cellAttrs: Record<string, unknown> = {}) =>
  doc({
    type: 'grid',
    attrs: { blockId: 'grid', columnWidths: [1] },
    content: [{ type: 'gridCell', attrs: cellAttrs, content: [para('inside')] }],
  });

async function setBlockDefaults(page: Page, defaults: Record<string, unknown> | null): Promise<void> {
  const res = defaults
    ? await page.request.post('/settings/branding?/saveBlockDefaults', { form: { blockDefaults: JSON.stringify(defaults) }, headers: sameOrigin() })
    : await page.request.post('/settings/branding?/resetBlockDefaults', { form: {}, headers: sameOrigin() });
  expect(res.ok()).toBe(true);
}

// The capability variables don't inherit and have no initial value (app.css),
// so the cell has a computed value only for what it declares itself.
const EMITTED = ['d', 't', 'p'].flatMap((tier) => [
  `--pad-${tier}`,
  ...['top', 'right', 'bottom', 'left'].map((side) => `--pad-${tier}-${side}`),
  `--surface-radius-${tier}`,
]);

const cellBox = (page: Page) =>
  page
    .locator('.grid-cell')
    .first()
    .evaluate((el, names) => {
      const s = getComputedStyle(el);
      const emitted = names.flatMap((name) => {
        const value = s.getPropertyValue(name).trim();
        return value ? [`${name}:${value}`] : [];
      });
      return { padding: s.paddingTop, radius: s.borderRadius, emitted };
    }, EMITTED);

const own = (emitted: string[], prefix: string) => emitted.filter((v) => v.startsWith(prefix));

// Reads the built-in defaults only; the site-wide tests below are held off meanwhile.
test.describe('capability defaults at rest', () => {
  test.use({ storageState: authState('admin') });

  test('an untouched container renders its group default in the editor and on the page, emitting nothing of its own', async ({ page }) => {
    const { slug } = await createPage(page.request, { doc: grid() });
    for (const surface of [`/${slug}`, `/${slug}/edit`]) {
      await page.goto(surface);
      await expect(page.getByText('inside')).toBeVisible();
      const box = await cellBox(page);
      expect(box.padding).toBe('8px');
      expect(box.radius).toBe('4px');
      expect(own(box.emitted, '--pad')).toEqual([]);
      expect(own(box.emitted, '--surface-radius')).toEqual([]);
    }
  });
});

test.describe('capability defaults', () => {
  // The defaults are site-wide: these tests run alone (tests/e2e/fixtures.ts).
  test.use({ storageState: authState('admin'), siteWide: true });

  test.afterEach(async ({ page }) => {
    await setBlockDefaults(page, null);
  });

  test('a pinned site default reaches the page and the editor, and the block settings panel shows it as Auto', async ({ page }) => {
    const { slug } = await createPage(page.request, { doc: grid() });
    await setBlockDefaults(page, { groups: { containers: { pad: 'md', radius: 'lg' } } });

    await page.goto(`/${slug}`);
    await expect(page.getByText('inside')).toBeVisible();
    let box = await cellBox(page);
    expect(box.padding).toBe('16px');
    expect(box.radius).toBe('12px');
    expect(own(box.emitted, '--pad')).toEqual([]);

    await page.goto(`/${slug}/edit`);
    await page.locator('.ProseMirror').click();
    await page.locator('.grid-cell p').first().click();
    await page.keyboard.press('Escape');
    const breadcrumb = page.getByRole('navigation', { name: 'Block ancestry' });
    await expect(breadcrumb.getByRole('button', { name: 'Cell', exact: true })).toHaveAttribute('aria-current', 'true');
    box = await cellBox(page);
    expect(box.padding).toBe('16px');
    expect(box.radius).toBe('12px');
    const panel = blockSettings(page);
    await expect(panel.getByText('Auto · 16 px')).toBeVisible();
    await expect(panel.getByText('Auto · 12 px')).toBeVisible();
  });

  test('a cards default reaches only the fields each quick-link variant carries', async ({ page }) => {
    const card = (label: string, variant: string) => ({ type: 'quickLink', attrs: { refType: 'url', url: 'https://example.com', label, variant } });
    const { slug } = await createPage(page.request, { doc: doc(card('link card', 'link'), card('outlined card', 'outlined'), card('button card', 'button')) });
    await setBlockDefaults(page, { groups: { cards: { bg: 'token:accent', border: 'token:accent' } } });
    const box = (label: string) =>
      page.locator('.quick-link', { hasText: label }).evaluate((el) => {
        const s = getComputedStyle(el);
        return { bg: s.backgroundColor, border: s.borderTopStyle, underline: s.textDecorationLine, font: s.fontFamily, padding: s.paddingLeft };
      });
    for (const surface of [`/${slug}`, `/${slug}/edit`]) {
      await page.goto(surface);
      await expect(page.getByText('button card')).toBeVisible();
      const link = await box('link card');
      expect(link.bg).toBe('rgba(0, 0, 0, 0)');
      expect(link.border).toBe('none');
      expect(link.underline).toBe('underline');
      const outlined = await box('outlined card');
      expect(outlined.bg).toBe('rgba(0, 0, 0, 0)');
      expect(outlined.border).toBe('solid');
      expect(outlined.underline).toBe('none');
      const button = await box('button card');
      expect(button.bg).not.toBe('rgba(0, 0, 0, 0)');
      expect(button.border).toBe('solid');
      expect(button.underline).toBe('none');
      // Every variant is the block's own anchor (QuickLinkCard.svelte): the
      // same type and padding as the link card, never a chrome primitive's.
      expect(button.font).toBe(link.font);
      expect(button.padding).toBe(link.padding);
    }
    // The block settings panel on a link card offers no Surface section; on the button it does.
    await page.locator('.quick-link', { hasText: 'link card' }).click();
    const panel = blockSettings(page);
    await expect(panel.getByRole('heading', { name: 'Surface' })).toHaveCount(0);
    await page.locator('.quick-link', { hasText: 'button card' }).click();
    await expect(panel.getByRole('heading', { name: 'Surface' })).toBeVisible();
  });

  test('a moved site width reaches every page and the block settings panel shows it as Auto; a page width of its own still wins', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const plain = await createPage(page.request, { doc: doc(para('plain')) });
    const own = await createPage(page.request, { doc: { type: 'doc', attrs: { layout: { widths: { desktop: { read: '600px' } } } }, content: [para('own')] } });
    await setBlockDefaults(page, { page: { widths: { read: 880 } } });
    const width = (id: string) => page.locator(`[data-block-id="${id}"]`).first().evaluate((el) => Math.round(el.getBoundingClientRect().width));

    await page.goto(`/${plain.slug}`);
    await expect(page.getByText('plain')).toBeVisible();
    expect(await width('plain')).toBe(880);
    await page.goto(`/${own.slug}`);
    await expect(page.getByText('own')).toBeVisible();
    expect(await width('own')).toBe(600);

    await page.goto(`/${plain.slug}/edit`);
    await page.getByText('plain').click();
    await page.getByRole('navigation', { name: 'Block ancestry' }).getByRole('button', { name: 'Page', exact: true }).click();
    expect(await width('plain')).toBe(880);
    await expect(blockSettings(page).getByRole('group', { name: 'Reading width' }).getByText('Auto · 880 px')).toBeVisible();
  });

  test('a moved site gutter reaches the page at its viewport only, and the block settings panel shows it as Auto', async ({ page }) => {
    const { slug } = await createPage(page.request, { doc: doc(para('plain')) });
    await setBlockDefaults(page, { page: { gutters: { phone: 'lg' } } });
    const gutter = () => page.locator('article.page-canvas .canvas-blocks').evaluate((el) => getComputedStyle(el).paddingLeft);

    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto(`/${slug}`);
    await expect(page.getByText('plain')).toBeVisible();
    expect(await gutter()).toBe('40px');
    await page.setViewportSize({ width: 800, height: 900 });
    await expect.poll(gutter).toBe('24px');
  });
});
