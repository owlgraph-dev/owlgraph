// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import type { Page } from '@playwright/test';
import { test, expect } from '$tests/e2e/fixtures';
import { authState } from '$tests/e2e/seed-data';
import { createPage } from '$tests/e2e/api';
import { doc, para, cell } from '$tests/e2e/doc';
import { layoutFingerprint } from '$tests/e2e/responsive';
import { blockSettings, stepUpTo } from '$tests/e2e/editor';

const stats = {
  type: 'grid',
  attrs: { blockId: 'stats', columnWidths: [1, 1, 1, 1] },
  content: ['f1', 'f2', 'f3', 'f4'].map((id) => cell(para(id))),
};

const fingerprint = async (page: Page, root: string, id: string) => (await layoutFingerprint(page, root))[id];

test.describe('grid columns per tier', () => {
  test.use({ storageState: authState('editorA'), viewport: { width: 1280, height: 900 } });

  test('four figures stack on a phone until the phone gets two columns of its own', async ({ page }) => {
    const { slug } = await createPage(page.request, { doc: doc(para('lead'), stats) });
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto(`/${slug}`);
    await expect.poll(() => fingerprint(page, '.canvas-blocks', 'stats')).toBe('grid 1 tracks 4x1');

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/${slug}/edit`);
    await page.getByRole('radio', { name: 'Phone preview' }).click();
    // The grid: from a figure's paragraph, up through its cell.
    await page.getByText('f1', { exact: true }).click();
    await stepUpTo(page, ['Paragraph', 'Cell', 'Grid']);

    const panel = blockSettings(page);
    const columns = panel.getByRole('group', { name: 'Columns', exact: true });
    await expect(columns.getByText('Auto · stacked')).toBeVisible();
    await columns.getByRole('radio', { name: 'Custom' }).click();
    // A phone of its own starts from the tablet's columns — here the desktop's four.
    const count = panel.getByRole('spinbutton', { name: 'Number of columns' });
    await expect(count).toHaveValue('4');
    await count.fill('2');
    await count.press('Tab');
    await expect.poll(() => fingerprint(page, '.ProseMirror', 'stats')).toBe('grid 2 tracks 2x2');

    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Saved')).toBeVisible({ timeout: 15000 });

    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto(`/${slug}`);
    await expect.poll(() => fingerprint(page, '.canvas-blocks', 'stats')).toBe('grid 2 tracks 2x2');
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect.poll(() => fingerprint(page, '.canvas-blocks', 'stats')).toBe('grid 4 tracks 1x4');

    // Auto takes the phone back to stacking.
    await page.goto(`/${slug}/edit`);
    await page.getByRole('radio', { name: 'Phone preview' }).click();
    await page.getByText('f1', { exact: true }).click();
    await stepUpTo(page, ['Paragraph', 'Cell', 'Grid']);
    await columns.getByRole('radio', { name: 'Auto' }).click();
    await expect.poll(() => fingerprint(page, '.ProseMirror', 'stats')).toBe('grid 1 tracks 4x1');
  });

  test("a merged cell spans its columns where the viewport has the desktop's, and reflows where it has fewer", async ({ page }) => {
    // Three columns, the first cell across two; on a tablet two columns of its own.
    const merged = {
      type: 'grid',
      attrs: { blockId: 'merged', columnWidths: [1, 1, 1], columnsByTier: { tablet: [1, 1] } },
      content: [
        { type: 'gridCell', attrs: { colStart: 1, rowStart: 1, colSpan: 2, rowSpan: 1 }, content: [para('wide')] },
        { type: 'gridCell', attrs: { colStart: 3, rowStart: 1, colSpan: 1, rowSpan: 1 }, content: [para('narrow')] },
      ],
    };
    const { slug } = await createPage(page.request, { doc: doc(merged) });
    const widths = () =>
      page.evaluate(() => ['wide', 'narrow'].map((id) => Math.round(document.querySelector(`[data-block-id="${id}"]`)!.closest('.grid-cell')!.getBoundingClientRect().width)));
    await page.goto(`/${slug}`);
    await expect.poll(async () => { const [w, n] = await widths(); return w > n * 1.8; }).toBe(true);
    await page.setViewportSize({ width: 820, height: 900 });
    await expect.poll(async () => { const [w, n] = await widths(); return Math.abs(w - n) <= 2; }).toBe(true);
    await expect.poll(() => fingerprint(page, '.canvas-blocks', 'merged')).toBe('grid 2 tracks 1x2');
  });
});
