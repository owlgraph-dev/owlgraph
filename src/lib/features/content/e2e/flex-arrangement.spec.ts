// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import type { Page } from '@playwright/test';
import { test, expect } from '$tests/e2e/fixtures';
import { authState } from '$tests/e2e/seed-data';
import { createPage } from '$tests/e2e/api';
import { doc, para } from '$tests/e2e/doc';
import { horizontalOverflow } from '$tests/e2e/responsive';
import { blockSettings, stepUpTo } from '$tests/e2e/editor';

const logos = {
  type: 'flexContainer',
  attrs: { blockId: 'logos', layout: { desktop: { gap: 24, justifyContent: 'space-between' } } },
  content: [1, 2, 3, 4, 5, 6].map((n) => ({
    type: 'flexCell',
    attrs: { flexItem: { desktop: { size: 'fixed', basis: '140px' } } },
    content: [para(`Logo ${n}`)],
  })),
};

const strip = (page: Page, root: string) =>
  page.locator(`${root} [data-block-id="logos"] > .flex`).evaluate((el) => ({
    scrolls: el.scrollWidth > el.clientWidth + 1,
    cell: Math.round(el.firstElementChild!.getBoundingClientRect().width),
  }));

async function selectStrip(page: Page) {
  await page.getByText('Logo 1', { exact: true }).click();
  await stepUpTo(page, ['Paragraph', 'Flex cell', 'Flex row']);
}

test.describe('flex arrangement per tier', () => {
  test.use({ storageState: authState('editorA'), viewport: { width: 1280, height: 900 } });

  test('a logo strip scrolls sideways on a phone in its own box, and stays a row on a desktop', async ({ page }) => {
    const { slug } = await createPage(page.request, { doc: doc(para('lead'), logos) });
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto(`/${slug}`);
    // One row: the fixed cells yield, nothing scrolls.
    await expect.poll(async () => (await strip(page, '.canvas-blocks')).cell).toBeLessThan(140);

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/${slug}/edit`);
    await page.getByRole('radio', { name: 'Phone preview' }).click();
    await selectStrip(page);
    const arrangement = blockSettings(page).getByRole('group', { name: 'Arrangement', exact: true });
    await expect(arrangement.getByText('In one row')).toBeVisible();
    await arrangement.getByRole('radio', { name: 'Scroll sideways' }).click();
    await expect.poll(() => strip(page, '.ProseMirror')).toEqual({ scrolls: true, cell: 140 });
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Saved')).toBeVisible({ timeout: 15000 });

    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto(`/${slug}`);
    await expect.poll(() => strip(page, '.canvas-blocks')).toEqual({ scrolls: true, cell: 140 });
    expect(await horizontalOverflow(page)).toEqual([]);
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect.poll(async () => (await strip(page, '.canvas-blocks')).scrolls).toBe(false);

    // Inherit gives the phone the desktop's row back.
    await page.goto(`/${slug}/edit`);
    await page.getByRole('radio', { name: 'Phone preview' }).click();
    await selectStrip(page);
    await arrangement.getByRole('radio', { name: 'Inherit', exact: true }).click();
    await expect.poll(async () => (await strip(page, '.ProseMirror')).scrolls).toBe(false);
  });
});
