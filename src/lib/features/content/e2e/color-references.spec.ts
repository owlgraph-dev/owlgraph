// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import type { Locator } from '@playwright/test';
import { test, expect } from '$tests/e2e/fixtures';
import { authState } from '$tests/e2e/seed-data';
import { createPage } from '$tests/e2e/api';
import { txt, doc } from '$tests/e2e/doc';

const para = (text: string, color: string) => ({ type: 'paragraph', attrs: { typography: { desktop: { color } } }, content: [txt(text)] });

const color = (locator: Locator) => locator.evaluate((el) => getComputedStyle(el).color);

test.describe('colour references', () => {
  test.use({ storageState: authState('admin') });

  test('a theme colour follows the scheme the page renders in; a literal stays the same', async ({ page, baseURL }) => {
    const { slug } = await createPage(page.request, {
      doc: doc(para('Theme accent text', 'token:accent'), para('Literal slate text', '#1e293b')),
      contentScheme: 'adaptive',
    });

    await page.goto(`/${slug}`);
    expect(await color(page.getByText('Theme accent text'))).toBe('rgb(37, 99, 235)');
    expect(await color(page.getByText('Literal slate text'))).toBe('rgb(30, 41, 59)');

    await page.context().addCookies([{ name: 'color_pref', value: 'dark', url: baseURL! }]);
    await page.reload();
    expect(await color(page.getByText('Theme accent text'))).toBe('rgb(122, 171, 255)');
    expect(await color(page.getByText('Literal slate text'))).toBe('rgb(30, 41, 59)');
  });

  test("a quick link filled with a theme colour takes that colour's readable text in each scheme", async ({ page, baseURL }) => {
    const { slug } = await createPage(page.request, {
      doc: doc({ type: 'quickLink', attrs: { refType: 'url', url: 'https://example.com', label: 'Themed button', surface: { desktop: { bg: 'token:accent' } } } }),
      contentScheme: 'adaptive',
    });
    const card = () => page.locator('.quick-link', { hasText: 'Themed button' });

    await page.goto(`/${slug}`);
    expect(await color(card())).toBe('rgb(255, 255, 255)');

    await page.context().addCookies([{ name: 'color_pref', value: 'dark', url: baseURL! }]);
    await page.reload();
    expect(await color(card())).toBe('rgb(12, 20, 36)');
  });
});
