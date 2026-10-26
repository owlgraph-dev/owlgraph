// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { test, expect, waitForHydration } from '$tests/e2e/fixtures';
import { createDocument, createPage, unique } from '$tests/e2e/api';
import { doc } from '$tests/e2e/doc';
import { horizontalOverflow, touchTargets } from '$tests/e2e/responsive';
import { authState } from '$tests/e2e/seed-data';
import { db } from '../../../platform/db.server';
import { anonymous } from '$tests/e2e/fixtures';
import { blockSettings } from '$tests/e2e/editor';

test.use({ storageState: authState('admin') });

const documentBlock = (blockId: string, nodeId: string, attrs: Record<string, unknown> = {}) => ({ type: 'documentBlock', attrs: { blockId, nodeId, ...attrs } });

/** A text document anyone may read (the default namespace is public). */
async function upload(request: Parameters<typeof createDocument>[0]) {
  const title = unique('Minutes').name;
  return { ...(await createDocument(request, { title })), title, filename: `${title}.txt` };
}

test.describe('the document block', () => {
  test('is inserted and picked in the editor, where it carries its chip, and read on the page as one link to the document’s content and its download', async ({ page, browser }) => {
    const minutes = await upload(page.request);
    const { slug } = await createPage(page.request, { visibility: null });

    await page.goto(`/${slug}/edit`);
    await page.locator('.ProseMirror').click();
    await page.getByRole('button', { name: 'Insert', exact: true }).click();
    await page.getByRole('group', { name: 'Document' }).getByRole('menuitem', { name: 'File or link', exact: true }).click();
    const editorBlock = page.locator('.ProseMirror .document-block');
    await expect(editorBlock).toContainText('Choose a document in the block settings.');
    await blockSettings(page).getByRole('button', { name: 'Choose…' }).click();
    const picker = page.getByRole('dialog', { name: 'Choose a document' });
    await picker.getByPlaceholder('Search documents').fill(minutes.title);
    await picker.getByRole('option', { name: new RegExp(minutes.title) }).click();
    await expect(editorBlock.locator('.de-title-text')).toHaveText(minutes.filename);
    await expect(editorBlock.locator('.de-chip')).toHaveText('Document');
    // The picker closed with the pick, so Escape steps the selection up again.
    const breadcrumb = page.getByRole('navigation', { name: 'Block ancestry' });
    await editorBlock.click();
    await expect(breadcrumb.getByRole('button', { name: 'Document', exact: true })).toHaveAttribute('aria-current', 'true');
    await page.keyboard.press('Escape');
    await expect(breadcrumb.getByRole('button', { name: 'Page', exact: true })).toHaveAttribute('aria-current', 'true');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Saved')).toBeVisible({ timeout: 15000 });

    const reader = await anonymous(browser);
    const view = await reader.newPage();
    await view.goto(`/${slug}`);
    const block = view.locator('.document-block');
    const entry = block.locator('a.de-entry');
    await expect(entry).toHaveAttribute('href', `/api/documents/${minutes.id}/content`);
    await expect(entry).toHaveAttribute('target', '_blank');
    await expect(entry).toHaveAttribute('rel', 'noopener');
    await expect(block.locator('.de-chip')).toHaveCount(0);
    await expect(block.getByRole('link', { name: 'Download' }).first()).toHaveAttribute('href', `/api/documents/${minutes.id}/content?download`);
    expect((await reader.request.get(`/api/documents/${minutes.id}/content`)).status()).toBe(200);
    await reader.close();
  });
});

test.describe('the document block on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('fits a phone: a row a finger can hit, its download an icon, nothing sideways', async ({ page }) => {
    const minutes = await upload(page.request);
    const { slug } = await createPage(page.request, { visibility: null, doc: doc(documentBlock('phone', minutes.id)) });
    await page.goto(`/${slug}`);
    await waitForHydration(page);
    await expect(page.locator('[data-block-id="phone"] .de-download-compact')).toBeVisible();
    await expect(page.locator('[data-block-id="phone"] .de-download-wide')).toBeHidden();
    expect(await horizontalOverflow(page)).toEqual([]);
    expect(await touchTargets(page, '[data-block-id="phone"]')).toEqual([]);
  });

  test('has its settings in a sheet of the phone editor, where a change is the block’s and saved', async ({ page }) => {
    const minutes = await upload(page.request);
    const { id, slug } = await createPage(page.request, { visibility: null, doc: doc(documentBlock('phone-settings', minutes.id)) });
    await page.goto(`/${slug}/edit`);
    const block = page.locator('.ProseMirror [data-block-id="phone-settings"]');
    await block.locator('.de-title-text').tap();
    await page.getByRole('button', { name: 'Block settings', exact: true }).tap();
    const sheet = page.getByRole('dialog', { name: 'Block settings' });
    await expect(sheet).toContainText(minutes.title);
    await sheet.getByRole('radio', { name: 'Card', exact: true }).tap();
    await expect(block.locator('.de--card')).toBeVisible();
    await sheet.getByRole('button', { name: 'Close', exact: true }).tap();
    await expect(sheet).toBeHidden();

    const saved = page.waitForResponse((r) => r.request().method() === 'PUT' && new URL(r.url()).pathname === `/api/pages/${id}`);
    await page.getByRole('button', { name: 'Save', exact: true }).tap();
    expect((await saved).ok()).toBe(true);
    const [row] = await db<{ doc: { content: { attrs: Record<string, unknown> }[] } }[]>`select doc from pages where id = ${id}`;
    expect(row.doc.content[0].attrs).toMatchObject({ blockId: 'phone-settings', nodeId: minutes.id, variant: 'card' });
  });
});
