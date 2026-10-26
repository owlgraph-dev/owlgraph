// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// docs/architecture/blocks/node-embeds.md, "A quick link becomes a block".
import type { Page } from '@playwright/test';
import { test, expect } from '$tests/e2e/fixtures';
import { createDocument, createPage, unique } from '$tests/e2e/api';
import { doc, txt } from '$tests/e2e/doc';
import { authState } from '$tests/e2e/seed-data';
import { db } from '../../../platform/db.server';
import { blockSettings, savePage } from '$tests/e2e/editor';

test.use({ storageState: authState('admin') });

const look = {
  variant: 'button',
  surface: { desktop: { bg: 'token:accent', border: 'token:border-strong', radius: 12 } },
  spacing: { desktop: { spaceAbove: 80 } },
  placement: { desktop: { align: 'end' } },
  typography: { desktop: { size: 'scale:lg' } },
};

const card = (attrs: Record<string, unknown>) => ({ type: 'quickLink', attrs: { blockId: 'card-1', label: 'Minutes', ...look, ...attrs } });
const above = { type: 'paragraph', content: [txt('Above the card.')] };

async function pageWithCard(page: Page, attrs: Record<string, unknown>) {
  return createPage(page.request, { visibility: null, doc: doc(above, card(attrs)) });
}

async function uploaded(page: Page) {
  const title = unique('Minutes').name;
  return { ...(await createDocument(page.request, { title })), title };
}

async function stored(pageId: string): Promise<{ type: string; attrs: Record<string, unknown> }[]> {
  const [row] = await db<{ doc: { content: { type: string; attrs: Record<string, unknown> }[] } }[]>`select doc from pages where id = ${pageId}`;
  return row.doc.content;
}

const tools = (page: Page) => page.getByRole('toolbar', { name: 'Block tools' });

test.describe('a quick link to a document', () => {
  test('becomes the document block from the block tools — the same block, its look kept as far as a block of documents has it — and Undo turns it back', async ({ page }) => {
    const minutes = await uploaded(page);
    const { id, slug } = await pageWithCard(page, { refType: 'document', targetDocId: minutes.id });
    await page.goto(`/${slug}/edit`);
    const block = page.locator('.ProseMirror [data-block-id="card-1"]');
    await expect(block).toHaveClass(/quick-link-block/);

    await block.click();
    await tools(page).getByRole('button', { name: 'Embed as block', exact: true }).click();
    await expect(block).toHaveClass(/document-block/);
    await expect(block.locator('.de-title-text')).toHaveText(`${minutes.title}.txt`);
    await expect(blockSettings(page)).toContainText(minutes.title);
    await savePage(page, id);
    const [, embedded] = await stored(id);
    expect(embedded).toEqual({
      type: 'documentBlock',
      attrs: expect.objectContaining({ blockId: 'card-1', nodeId: minutes.id, surface: look.surface, spacing: look.spacing, placement: look.placement, typography: look.typography, variant: 'row' }),
    });
    expect(embedded.attrs).not.toHaveProperty('label');

    await page.getByText('Above the card.').click();
    await page.keyboard.press('ControlOrMeta+z');
    await expect(block).toHaveClass(/quick-link-block/);
    await savePage(page, id);
    const [, back] = await stored(id);
    expect(back).toEqual({ type: 'quickLink', attrs: expect.objectContaining({ blockId: 'card-1', refType: 'document', targetDocId: minutes.id, ...look }) });
  });

  test('becomes one from its block settings panel too, keeping of an outline only the outline — and the page shows the document', async ({ page, browser }) => {
    const minutes = await uploaded(page);
    const { id, slug } = await pageWithCard(page, { refType: 'document', targetDocId: minutes.id, variant: 'outlined' });
    await page.goto(`/${slug}/edit`);
    const block = page.locator('.ProseMirror [data-block-id="card-1"]');
    await block.click();
    const panel = blockSettings(page);
    await panel.getByRole('button', { name: 'Embed as block', exact: true }).click();
    await expect(block).toHaveClass(/document-block/);
    await savePage(page, id);
    const [, embedded] = await stored(id);
    // An outlined card draws no fill, so the fill stays behind.
    expect(embedded.attrs.surface).toEqual({ desktop: { border: 'token:border-strong', radius: 12 } });

    const reader = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const view = await reader.newPage();
    await view.goto(`/${slug}`);
    await expect(view.locator('[data-block-id="card-1"].document-block .de-title-text')).toHaveText(`${minutes.title}.txt`);
    await reader.close();
  });

  test('to a page or an address offers nothing of the kind', async ({ page }) => {
    const target = await createPage(page.request, { visibility: null, title: unique('Target').name });
    for (const attrs of [{ refType: 'page', targetPageId: target.id }, { refType: 'url', url: 'https://example.org/' }]) {
      const { slug } = await pageWithCard(page, attrs);
      await page.goto(`/${slug}/edit`);
      await page.locator('.ProseMirror [data-block-id="card-1"]').click();
      await expect(tools(page).getByRole('button', { name: 'Move block up' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Embed as block', exact: true })).toHaveCount(0);
    }
  });
});
