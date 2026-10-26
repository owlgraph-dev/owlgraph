// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import type { Page } from '@playwright/test';
import { test, expect } from '$tests/e2e/fixtures';
import { authState } from '$tests/e2e/seed-data';
import { createPage } from '$tests/e2e/api';
import { blockSettings } from '$tests/e2e/editor';

// Style names are seeded site data (Subtitle is the h2 default, Body text the
// paragraph default); the run is in English (docs/architecture/typography.md).

async function pickParagraphStyle(page: Page, label: string): Promise<void> {
  const item = page.getByRole('menuitem', { name: new RegExp(`^${label}\\b`) });
  await page.getByRole('button', { name: 'Paragraph style' }).click();
  await expect(item).toBeVisible();
  await item.click();
}

test.describe('paragraph styles in the editor', () => {
  test.use({ storageState: authState('admin') });

  test('picking a style sets the element in the editor and on the public page; Enter starts a plain paragraph', async ({ page }) => {
    const { slug } = await createPage(page.request);
    await page.goto(`/${slug}/edit`);
    const proseMirror = page.locator('.ProseMirror');
    await proseMirror.click();
    await page.keyboard.type('Section title');

    await pickParagraphStyle(page, 'Subtitle');
    const h2 = proseMirror.locator('h2[data-paragraph-style]');
    await expect(h2).toHaveCount(1);
    await expect(h2).toHaveText('Section title');
    // By rule (data-ps names the style), never an inline var: 2xl is 1.5rem.
    await expect(h2).toHaveAttribute('data-ps', /.+/);
    await expect(h2).toHaveCSS('font-size', '24px');
    expect(await h2.getAttribute('style')).toBeNull();

    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Body copy');
    await expect(proseMirror.locator('p').last()).toHaveText('Body copy');
    await expect(proseMirror.locator('p[data-paragraph-style]')).toHaveCount(0);

    // docs/architecture/blocks/capabilities.md, "Where capabilities are edited".
    await h2.click();
    const panel = blockSettings(page);
    await expect(panel.getByRole('heading', { name: 'Spacing' })).toBeVisible();
    await expect(panel.getByRole('heading', { name: 'Surface' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Saved')).toBeVisible({ timeout: 15000 });

    await page.goto(`/${slug}`);
    const html = await page.content();
    expect(html).toMatch(/<h2 class="cap-typography"[^>]*data-ps="[^"]+"[^>]*>Section title<\/h2>/);
    expect(html).not.toMatch(/<h2 [^>]*style=/);
    await expect(page.locator('article.prose h2')).toHaveCSS('font-size', '24px');
    expect(html).toContain('>Body copy</p>');
  });

  test('a markdown ## still makes the h2 default, and picking the paragraph default turns a heading back into a paragraph', async ({ page }) => {
    const { slug } = await createPage(page.request);
    await page.goto(`/${slug}/edit`);
    const proseMirror = page.locator('.ProseMirror');
    await proseMirror.click();
    await page.keyboard.type('## Shortcut heading');
    const h2 = proseMirror.locator('h2');
    await expect(h2).toHaveCount(1);
    await expect(h2).toHaveText('Shortcut heading');
    await expect(proseMirror.locator('h2[data-paragraph-style]')).toHaveCount(0);
    await expect(h2).toHaveAttribute('data-ps', /.+/);
    await expect(h2).toHaveCSS('font-size', '24px');

    await pickParagraphStyle(page, 'Body text');
    await expect(proseMirror.locator('h2')).toHaveCount(0);
    await expect(proseMirror.locator('p[data-paragraph-style]')).toHaveText('Shortcut heading');
  });
});
