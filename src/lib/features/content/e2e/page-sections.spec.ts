// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import type { Page } from '@playwright/test';
import { test, expect } from '$tests/e2e/fixtures';
import { authState } from '$tests/e2e/seed-data';
import { createPage } from '$tests/e2e/api';
import { txt, doc, para, cell } from '$tests/e2e/doc';
import { blockSettings } from '$tests/e2e/editor';

const note = (id: string) => ({ type: 'callout', attrs: { blockId: id, variant: 'info' }, content: [txt(id)] });
const section = (id: string, attrs: Record<string, unknown>, ...cells: unknown[]) => ({ type: 'pageSection', attrs: { blockId: id, ...attrs }, content: cells });
const ARTIKEL = { mode: 'columns', template: { desktop: [3, 2], tablet: [3, 2], phone: [1] }, preset: 'main-aside' };

const article = {
  type: 'doc',
  attrs: { layout: ARTIKEL },
  content: [1, 2, 3].map((n) => section(`s${n}`, { width: 'wide' }, cell(para(`p${n}`)), cell(note(`n${n}`)))),
};

const box = (page: Page, id: string) =>
  page.locator(`[data-block-id="${id}"]`).first().evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { top: Math.round(r.top), left: Math.round(r.left), right: Math.round(r.right) };
  });

async function expectInterleaved(page: Page, label: string) {
  const tops: number[] = [];
  for (const n of [1, 2, 3]) {
    tops.push((await box(page, `p${n}`)).top, (await box(page, `n${n}`)).top);
  }
  // p1 < n1 < p2 < n2 < p3 < n3: every note right after its own paragraph.
  for (let i = 1; i < tops.length; i++) expect(tops[i], `${label}: ${tops.join(' < ')}`).toBeGreaterThan(tops[i - 1]);
}

async function expectSideBySide(page: Page, label: string) {
  for (const n of [1, 2, 3]) {
    const p = await box(page, `p${n}`);
    const a = await box(page, `n${n}`);
    expect(Math.abs(a.top - p.top), `${label}: row ${n}`).toBeLessThanOrEqual(2);
    expect(a.left, `${label}: row ${n}`).toBeGreaterThan(p.right);
  }
}

async function selectPage(page: Page, blockText: string) {
  await page.getByText(blockText, { exact: true }).first().click();
  const breadcrumb = page.getByRole('navigation', { name: 'Block ancestry' });
  // The page is the chain's root: step up until it is the selection.
  for (let i = 0; i < 5; i++) {
    const pageCrumb = breadcrumb.getByRole('button', { name: 'Page', exact: true });
    if ((await pageCrumb.count()) && (await pageCrumb.getAttribute('aria-current')) === 'true') return;
    await page.keyboard.press('Escape');
  }
  await expect(breadcrumb.getByRole('button', { name: 'Page', exact: true })).toHaveAttribute('aria-current', 'true');
}

test.describe('page sections', () => {
  test.use({ storageState: authState('admin'), viewport: { width: 1280, height: 900 } });

  test('an article reads side by side on a desktop and paragraph → its note on a phone, on the page and in the editor', async ({ page }) => {
    const { slug } = await createPage(page.request, { doc: article });
    await page.goto(`/${slug}`);
    await expect(page.getByText('p1', { exact: true })).toBeVisible();
    await expectSideBySide(page, 'page, desktop');

    await page.setViewportSize({ width: 390, height: 900 });
    await expect.poll(async () => (await box(page, 'n1')).top > (await box(page, 'p1')).top).toBe(true);
    await expectInterleaved(page, 'page, phone');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/${slug}/edit`);
    await expect(page.getByText('p1', { exact: true })).toBeVisible();
    await page.getByRole('radio', { name: 'Phone preview' }).click();
    await expect.poll(async () => (await box(page, 'n1')).top > (await box(page, 'p1')).top).toBe(true);
    await expectInterleaved(page, 'editor, phone preview');
  });

  test('a flow page converts into one section and back, each an undoable step', async ({ page }) => {
    const { slug } = await createPage(page.request, { doc: doc(para('one'), para('two')) });
    await page.goto(`/${slug}/edit`);
    await selectPage(page, 'one');
    await page.getByRole('combobox', { name: 'Page layout' }).click();
    await page.getByRole('option', { name: 'Main and side column' }).click();
    const dialog = page.getByRole('dialog', { name: 'Convert into sections?' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Convert' }).click();

    const editor = page.locator('.editor .ProseMirror');
    await expect(editor.locator('.page-section')).toHaveCount(1);
    await expect(editor.locator('.page-section .grid-cell')).toHaveCount(2);
    await expect(editor.locator('.page-section .grid-cell').first()).toContainText('one');
    await expect(editor.locator('.page-section .grid-cell').first()).toContainText('two');

    await editor.click();
    await page.keyboard.press('Control+z');
    await expect(editor.locator('.page-section')).toHaveCount(0);
    await expect(editor.locator('> p')).toHaveCount(2);
  });

  test('fewer columns merge the content into the last one that stays, and say so', async ({ page }) => {
    const { slug } = await createPage(page.request, { doc: article });
    await page.goto(`/${slug}/edit`);
    await selectPage(page, 'p1');
    await page.getByRole('combobox', { name: 'Page layout' }).click();
    await page.getByRole('option', { name: 'Sections' }).click();
    // The toast, not the live region that announces it a moment later with the same words.
    await expect(page.getByRole('region', { name: 'Notifications' }).getByText('Content from column 2 was merged into column 1 (3 sections).')).toBeVisible();
    const editor = page.locator('.editor .ProseMirror');
    await expect(editor.locator('.page-section .grid-cell')).toHaveCount(3);
    for (const n of [1, 2, 3]) {
      await expect(editor.getByText(`p${n}`, { exact: true })).toBeVisible();
      await expect(editor.getByText(`n${n}`, { exact: true })).toBeVisible();
    }
  });

  test('a section is added at the end, sits in the breadcrumb, and turns single-column without losing content', async ({ page }) => {
    const { slug } = await createPage(page.request, { doc: article });
    await page.goto(`/${slug}/edit`);
    const editor = page.locator('.editor .ProseMirror');
    await expect(editor.locator('.page-section')).toHaveCount(3);
    await page.getByRole('button', { name: '＋ Section', exact: true }).click();
    await expect(editor.locator('.page-section')).toHaveCount(4);
    await expect(editor.locator('.page-section').last().locator('.grid-cell')).toHaveCount(2);

    // Page › Section › Cell › Paragraph: two steps up from the paragraph is its section.
    const breadcrumb = page.getByRole('navigation', { name: 'Block ancestry' });
    await page.getByText('p2', { exact: true }).click();
    await expect(breadcrumb.getByRole('button', { name: 'Paragraph', exact: true })).toHaveAttribute('aria-current', 'true');
    await page.keyboard.press('Escape');
    await expect(breadcrumb.getByRole('button', { name: 'Cell', exact: true })).toHaveAttribute('aria-current', 'true');
    await page.keyboard.press('Escape');
    await expect(breadcrumb.getByRole('button', { name: 'Section', exact: true })).toHaveAttribute('aria-current', 'true');

    const panel = blockSettings(page);
    await panel.getByRole('radio', { name: 'Single column' }).click();
    const second = editor.locator('.page-section').nth(1);
    await expect(second.locator('.grid-cell')).toHaveCount(1);
    await expect(second.locator('.grid-cell')).toContainText('p2');
    await expect(second.locator('.grid-cell')).toContainText('n2');
  });

  test('a full-width first section bleeds to the canvas edge and the top', async ({ page }) => {
    const { slug } = await createPage(page.request, {
      doc: {
        type: 'doc',
        attrs: { layout: { mode: 'columns', template: { desktop: [1], tablet: [1], phone: [1] }, preset: 'sections' } },
        content: [section('hero', { width: 'full', bleedToTop: true, surface: { desktop: { bg: 'token:subtle' } } }, cell(para('hero-text'))), section('next', {}, cell(para('after')))],
      },
    });
    await page.goto(`/${slug}`);
    await expect(page.getByText('hero-text')).toBeVisible();
    const geo = await page.evaluate(() => {
      const canvas = document.querySelector('article.page-canvas')!.getBoundingClientRect();
      // The section's block (its wrapper) bleeds; its row carries the padding.
      const hero = document.querySelector('[data-block-id="hero"]')!;
      const r = hero.getBoundingClientRect();
      return { left: r.left - canvas.left, right: canvas.right - r.right, top: r.top - canvas.top, pad: getComputedStyle(hero.querySelector(':scope > .grid')!).paddingLeft };
    });
    expect(geo).toEqual({ left: 0, right: 0, top: 0, pad: '40px' });
  });
});
