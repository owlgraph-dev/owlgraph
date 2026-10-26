// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { test, expect } from '$tests/e2e/fixtures';
import { authState, seed } from '$tests/e2e/seed-data';
import { createPage } from '$tests/e2e/api';
import { doc, para } from '$tests/e2e/doc';
import type { Page } from '@playwright/test';
import { blockSettings } from '$tests/e2e/editor';

const template = { type: 'grid', attrs: { blockId: 'tpl', columnWidths: [1] }, content: [{ type: 'gridCell', content: [para('tplp')] }] };
const queryBlock = (attrs: Record<string, unknown> = {}) => ({
  type: 'queryBlock',
  attrs: { blockId: 'q', filter: { property: { name: seed.propStatus, operator: 'EQ', value: 'active' } }, first: 5, ...attrs },
  content: [template],
});
const OPTIONS = {
  layout: { desktop: { flexDirection: 'row', gap: 24 } },
  spacing: { desktop: { pad: 16, spaceAbove: 40 } },
  surface: { desktop: { bg: '#f1f5f9', radius: 12 } },
};

const EDITOR = '.ProseMirror';
const PAGE = '.canvas-blocks';
const look = (page: Page, root: string) =>
  page.locator(`${root} [data-block-id="q"]`).evaluate((el) => {
    const cs = getComputedStyle(el);
    return { direction: cs.flexDirection, gap: cs.columnGap, pad: cs.paddingTop, bg: cs.backgroundColor, radius: cs.borderTopLeftRadius, above: cs.marginTop };
  });
// The container's width against the reading column, which the paragraph `intro` fills.
const widths = (page: Page, root: string) =>
  page.locator(root).evaluate((r) => ({
    block: r.querySelector('[data-block-id="q"]')!.getBoundingClientRect().width,
    column: r.querySelector('[data-block-id="intro"]')!.getBoundingClientRect().width,
  }));

test.describe('the query block’s result container', () => {
  test.use({ storageState: authState('admin'), viewport: { width: 1280, height: 900 } });

  test('takes its arrangement, padding, surface and space above in the editor and on the page', async ({ page }) => {
    const { slug } = await createPage(page.request, { doc: doc(para('intro'), queryBlock({ formatOptions: OPTIONS })) });
    await page.goto(`/${slug}`);
    await expect(page.locator(`${PAGE} [data-block-id="q"] .query-block-instance`).first()).toBeVisible();
    const onPage = await look(page, PAGE);
    expect(onPage).toMatchObject({ direction: 'row', gap: '24px', pad: '16px', bg: 'rgb(241, 245, 249)', radius: '12px' });
    expect(parseFloat(onPage.above)).toBeGreaterThan(0);
    await page.goto(`/${slug}/edit`);
    await expect(page.locator(`${EDITOR} [data-block-id="tplp"]`)).toBeVisible();
    expect(await look(page, EDITOR)).toEqual(onPage);
    // In the editor too it names a rule of the live sheet, never a style attribute.
    await expect(page.locator(`${EDITOR} [data-block-id="q"]`)).toHaveAttribute('data-b', /.+/);
    expect(await page.locator(`${EDITOR} [data-block-id="q"]`).getAttribute('style')).toBeNull();
  });

  test('a wide one breaks out of the reading column in the editor and on the page', async ({ page }) => {
    const { slug } = await createPage(page.request, { doc: doc(para('intro'), queryBlock({ width: 'wide' })) });
    await page.goto(`/${slug}`);
    await expect(page.locator(`${PAGE} [data-block-id="q"] .query-block-instance`).first()).toBeVisible();
    const p = await widths(page, PAGE);
    expect(p.block).toBeGreaterThan(p.column + 100);
    await page.goto(`/${slug}/edit`);
    await expect(page.locator(`${EDITOR} [data-block-id="tplp"]`)).toBeVisible();
    const e = await widths(page, EDITOR);
    expect(e.block).toBeGreaterThan(e.column + 100);
  });

  test('a block settings edit redraws it in the editor at once', async ({ page }) => {
    const { slug } = await createPage(page.request, { doc: doc(para('intro'), queryBlock()) });
    await page.goto(`/${slug}/edit`);
    await page.locator(`${EDITOR} [data-block-id="tplp"]`).click();
    // Up the ancestry — paragraph, cell, the template's container — to the query block.
    const breadcrumb = page.getByRole('navigation', { name: 'Block ancestry' });
    const current = breadcrumb.locator('[aria-current="true"]');
    await expect(current).toHaveText('Paragraph');
    for (const level of ['Cell', 'Grid', 'Live query']) {
      await breadcrumb.getByRole('button', { name: 'Select parent block' }).click();
      await expect(current).toHaveText(level);
    }
    expect((await look(page, EDITOR)).direction).toBe('column');
    const panel = blockSettings(page);
    await panel.locator('[title="Left to right"]').first().click();
    await expect.poll(async () => (await look(page, EDITOR)).direction).toBe('row');
    await panel.getByRole('group', { name: 'Gap' }).first().locator('[title$="(24px)"]').click();
    await expect.poll(async () => (await look(page, EDITOR)).gap).toBe('24px');
  });
});
