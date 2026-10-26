// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import type { Locator } from '@playwright/test';
import { test, expect } from '$tests/e2e/fixtures';
import { createPage } from '$tests/e2e/api';
import { doc, txt } from '$tests/e2e/doc';
import { authState } from '$tests/e2e/seed-data';

// What a page is served per scheme is pages.http.test.ts's.

const DARK_CANVAS = 'rgb(28, 28, 27)';

const textPara = (text: string, typography?: unknown) => ({
  type: 'paragraph',
  ...(typography ? { attrs: { typography } } : {}),
  content: [txt(text)],
});

const BODY = doc(textPara('Scheme page body'));

const bg = (locator: Locator) => locator.evaluate((el) => getComputedStyle(el).backgroundColor);

test.describe('page content scheme', () => {
  test.use({ storageState: authState('admin') });

  test('a page pinned dark renders dark for a light viewer, on the public page and in the editor', async ({ page, baseURL }) => {
    const { slug } = await createPage(page.request, { doc: BODY, contentScheme: 'dark' });
    await page.context().addCookies([{ name: 'color_pref', value: 'light', url: baseURL! }]);

    await page.goto(`/${slug}`);
    await expect(page.locator('main.canvas-route')).toHaveAttribute('data-scheme', 'dark');
    expect(await bg(page.locator('.page-canvas'))).toBe(DARK_CANVAS);
    expect(await page.locator('html').getAttribute('data-color-pref')).toBe('light');

    await page.goto(`/${slug}/edit`);
    const editorCanvas = page.locator('.editor.page-canvas');
    await expect(editorCanvas).toHaveAttribute('data-scheme', 'dark');
    // A pinned page has nothing to preview.
    await expect(page.getByRole('group', { name: 'Preview colour scheme' })).toHaveCount(0);
  });

  test('the editor lists what would not read when the page adapts, applies the choice and previews it', async ({ page }) => {
    const { slug } = await createPage(page.request, { doc: doc(textPara('Slate text', { desktop: { color: '#1e293b' } })) });
    await page.goto(`/${slug}/edit`);

    const more = page.getByRole('button', { name: 'More' });
    const item = page.getByRole('menuitem', { name: 'Colour scheme' });
    await more.click();
    await expect(item).toBeVisible();
    await item.click();

    const dialog = page.getByRole('dialog', { name: 'Colour scheme' });
    await expect(dialog.getByRole('radio', { name: 'Site default (Light)' })).toHaveAttribute('data-state', 'checked');
    await dialog.getByRole('radio', { name: "Adapts to the reader's scheme" }).click();
    await expect(dialog.getByText('Some colours may not read when the page adapts')).toBeVisible();
    await expect(dialog.getByText(/text reads at [\d.]+:1 on a dark page/)).toBeVisible();

    await dialog.getByRole('button', { name: 'Apply' }).click();
    await expect(dialog).toBeHidden();

    // The preview starts in the author's own scheme.
    const canvas = page.locator('.editor.page-canvas');
    await expect(canvas).toHaveAttribute('data-scheme', 'light');
    const preview = page.getByRole('group', { name: 'Preview colour scheme' });
    await preview.getByRole('radio', { name: 'Preview in dark' }).click();
    await expect(canvas).toHaveAttribute('data-scheme', 'dark');
    expect(await bg(canvas)).toBe(DARK_CANVAS);

    await page.goto(`/${slug}`);
    await expect(page.locator('.page-canvas')).not.toHaveAttribute('data-scheme', /.*/);
  });

  test('a diagram re-renders in the scheme the editor previews', async ({ page }) => {
    const { slug } = await createPage(page.request, {
      doc: doc({ type: 'diagram', attrs: { code: 'graph TD; A-->B' } }),
      contentScheme: 'adaptive',
    });
    await page.goto(`/${slug}/edit`);

    const diagram = page.locator('.diagram-block svg');
    await expect(diagram).toBeVisible({ timeout: 20000 });
    // The palette's text colour is baked into the rendered diagram.
    await expect.poll(() => diagram.evaluate((svg) => svg.outerHTML.toLowerCase()), { timeout: 20000 }).toContain('#1d1d1f');

    await page.getByRole('group', { name: 'Preview colour scheme' }).getByRole('radio', { name: 'Preview in dark' }).click();
    await expect.poll(() => page.locator('.diagram-block svg').evaluate((svg) => svg.outerHTML.toLowerCase()), { timeout: 20000 }).toContain('#ecebe8');
  });
});
