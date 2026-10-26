// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import type { Locator } from '@playwright/test';
import { test, expect } from '$tests/e2e/fixtures';
import AxeBuilder from '@axe-core/playwright';
import { authState } from '$tests/e2e/seed-data';
import { createPage } from '$tests/e2e/api';
import { txt, doc } from '$tests/e2e/doc';
import { setColorPref } from '$tests/e2e/fixtures';
import { blockSettings } from '$tests/e2e/editor';

const para = (text: string, typography?: unknown) => ({ type: 'paragraph', ...(typography ? { attrs: { typography } } : {}), content: [txt(text)] });
const cell = (surface: unknown, content: unknown[]) => ({ type: 'gridCell', attrs: { surface }, content });
const link = (label: string) => ({ type: 'quickLink', attrs: { refType: 'url', url: 'https://example.com', label } });

const DARK_TEXT = 'rgb(236, 235, 232)'; // the dark scheme's text colour
const DARK_ACCENT = 'rgb(122, 171, 255)';
const LIGHT_TEXT = 'rgb(29, 29, 31)';

const regionDoc = doc(
  para('On the page ground.'),
  {
    type: 'grid',
    attrs: { columnWidths: [1, 1, 1] },
    content: [
      cell({ desktop: { bg: '#0f172a' } }, [para('Dark card text'), link('Dark card link'), para('Dark card accent', { desktop: { color: 'token:accent' } })]),
      cell({ desktop: { bg: '#fef3c7' } }, [para('Light card text'), link('Light card link')]),
      cell({ desktop: { bg: '#0f172a' }, phone: { bg: '#fef3c7' } }, [para('Responsive card text')]),
    ],
  },
  { type: 'quickLink', attrs: { refType: 'url', url: 'https://example.com', label: 'Blue button', surface: { desktop: { bg: '#2563eb' } } } },
  {
    type: 'grid',
    attrs: { columnWidths: [1, 1] },
    content: [cell({ desktop: { bg: 'token:inverse' } }, [para('Inverse card text')]), cell({ desktop: { bg: 'rgba(0, 0, 0, 0.4)' } }, [para('Translucent card text')])],
  }
);

const color = (locator: Locator) => locator.evaluate((el) => getComputedStyle(el).color);

test.describe('scheme regions', () => {
  test.use({ storageState: authState('admin') });

  test('a dark card reads the same in every viewer scheme, on an adaptive and on a pinned page', async ({ page, baseURL }) => {
    const adaptive = await createPage(page.request, { doc: regionDoc, contentScheme: 'adaptive' });
    const pinned = await createPage(page.request, { doc: regionDoc, contentScheme: 'light' });
    for (const [pref, slug] of [['light', adaptive.slug], ['dark', adaptive.slug], ['dark', pinned.slug]] as const) {
      await setColorPref(page, baseURL!, pref);
      await page.goto(`/${slug}`);
      const card = page.locator('.grid-cell', { hasText: 'Dark card text' });
      await expect(card, `${pref} ${slug}`).toHaveAttribute('data-scheme', 'dark');
      expect(await color(page.getByText('Dark card text'))).toBe(DARK_TEXT);
      expect(await color(page.getByText('Dark card accent'))).toBe(DARK_ACCENT);
      expect(await color(page.locator('.quick-link', { hasText: 'Dark card link' }))).toBe(DARK_ACCENT);
      await expect(page.locator('.grid-cell', { hasText: 'Light card text' })).toHaveAttribute('data-scheme', 'light');
      expect(await color(page.getByText('Light card text'))).toBe(LIGHT_TEXT);
      // An old button-preset card keeps white text: its blue reads better with the dark scheme.
      expect(await color(page.locator('.quick-link', { hasText: 'Blue button' }))).toBe('rgb(255, 255, 255)');
    }
  });

  test('a theme-colour or translucent background follows the page; the inverse fill pairs its text', async ({ page, baseURL }) => {
    const { slug } = await createPage(page.request, { doc: regionDoc, contentScheme: 'adaptive' });
    await setColorPref(page, baseURL!, 'light');
    await page.goto(`/${slug}`);
    const inverse = page.locator('.grid-cell', { hasText: 'Inverse card text' });
    await expect(inverse).not.toHaveAttribute('data-scheme', /.*/);
    await expect(page.locator('.grid-cell', { hasText: 'Translucent card text' })).not.toHaveAttribute('data-scheme', /.*/);
    expect(await color(page.getByText('Inverse card text'))).toBe('rgb(255, 255, 255)');
    await setColorPref(page, baseURL!, 'dark');
    await page.reload();
    expect(await color(page.getByText('Inverse card text'))).toBe('rgb(28, 28, 27)');
    expect(await color(page.getByText('Translucent card text'))).toBe(DARK_TEXT);
  });

  test('pins per tier where the background changes between them', async ({ page, baseURL }) => {
    const { slug } = await createPage(page.request, { doc: regionDoc, contentScheme: 'adaptive' });
    await setColorPref(page, baseURL!, 'light');
    await page.goto(`/${slug}`);
    const responsive = page.locator('.grid-cell', { hasText: 'Responsive card text' });
    await expect(responsive).toHaveAttribute('data-scheme-d', 'dark');
    await expect(responsive).toHaveAttribute('data-scheme-p', 'light');
    expect(await color(page.getByText('Responsive card text'))).toBe(DARK_TEXT);
    await page.setViewportSize({ width: 390, height: 900 });
    await expect.poll(() => color(page.getByText('Responsive card text'))).toBe(LIGHT_TEXT);
  });

  test('the editor puts the same scheme attributes on the same blocks as the page', async ({ page }) => {
    const { slug } = await createPage(page.request, { doc: regionDoc, contentScheme: 'adaptive' });
    // Every pinned element's scheme attributes, in document order.
    const schemeAttributesOf = (root: Locator) =>
      root.locator('[data-scheme], [data-scheme-d], [data-scheme-t], [data-scheme-p]').evaluateAll((els) =>
        els.map((el) => ['data-scheme', 'data-scheme-d', 'data-scheme-t', 'data-scheme-p'].map((a) => el.getAttribute(a) ?? '-').join(' '))
      );
    await page.goto(`/${slug}`);
    await expect(page.getByText('Dark card text')).toBeVisible();
    const published = await schemeAttributesOf(page.locator('.page-canvas'));
    await page.goto(`/${slug}/edit`);
    await expect(page.locator('.editor .grid-cell').first()).toBeVisible();
    const edited = await schemeAttributesOf(page.locator('.editor .ProseMirror'));
    expect(published).toEqual(['dark - - -', 'light - - -', '- dark dark light', 'dark - - -']);
    expect(edited).toEqual(published);
  });

  test('the block settings panel warns when no default text reads on a background', async ({ page }) => {
    const { slug } = await createPage(page.request, {
      doc: doc({ type: 'grid', attrs: { columnWidths: [1] }, content: [cell({ desktop: { bg: '#808080' } }, [para('Grey card text')])] }),
      contentScheme: 'adaptive',
    });
    await page.goto(`/${slug}/edit`);
    await expect(async () => {
      await page.getByText('Grey card text').click();
      await page.getByRole('navigation', { name: 'Block ancestry' }).getByRole('button', { name: 'Cell', exact: true }).click({ timeout: 1000 });
    }).toPass({ timeout: 15000 });
    await expect(blockSettings(page)).toContainText('Neither default text colour reads on this background');
  });

  for (const pref of ['light', 'dark'] as const) {
    test(`content with scheme regions passes axe colour contrast for a ${pref} viewer`, async ({ page, baseURL }) => {
      const { slug } = await createPage(page.request, { doc: regionDoc, contentScheme: 'adaptive' });
      await setColorPref(page, baseURL!, pref);
      await page.goto(`/${slug}`);
      await expect(page.getByText('Dark card text')).toBeVisible();
      const results = await new AxeBuilder({ page }).include('.page-canvas').withRules(['color-contrast']).analyze();
      expect(results.violations.flatMap((v) => v.nodes.map((n) => `${n.target} ${n.failureSummary}`))).toEqual([]);
    });
  }
});
