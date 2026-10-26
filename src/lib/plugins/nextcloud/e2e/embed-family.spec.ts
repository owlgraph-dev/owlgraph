// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// E2E because: picking a plugin node in a core block's picker turns the block
// into the plugin's, its id and capabilities carried, and Undo turns it back in
// one step (docs/architecture/blocks/node-embeds.md, "One family in the editor").
import type { APIRequestContext, Locator, Page } from '@playwright/test';
import { test, expect } from '$tests/e2e/fixtures';
import { createPage, unique } from '$tests/e2e/api';
import { doc, txt } from '$tests/e2e/doc';
import { authState } from '$tests/e2e/seed-data';
import { db } from '../../../platform/db.server';
import { startMockNextcloud, type MockNextcloud } from './mockNextcloud';
import { blockSettings, savePage } from '$tests/e2e/editor';
import { configure } from './settings';

const API = '/api/plugins/nextcloud';
let mock: MockNextcloud;
let shares = 0;

test.beforeAll(async () => {
  mock = await startMockNextcloud();
});
test.afterAll(async () => {
  await mock.close();
});
test.beforeEach(() => {
  mock.mode = 'ok';
});

test.use({ lock: 'integration-settings', storageState: authState('admin') });

/** A uniquely named share's collection, and a document of its one file. */
async function connect(request: APIRequestContext) {
  const name = unique('Ablage').name;
  const file = `${unique('Bericht').name}.pdf`;
  const token = `E2eFamily${process.pid}x${++shares}`;
  mock.shares.set(token, {
    name,
    files: { [file]: { content: '%PDF-1.4\n', mime: 'application/pdf', fileid: 801, modified: new Date('2026-10-02T09:30:00Z') } },
    folders: ['Q3'],
  });
  const anchor = await createPage(request, { visibility: null });
  const res = await request.post(`${API}/collections`, { data: { pageId: anchor.id, shareUrl: `${mock.origin}/s/${token}` } });
  expect(res.status(), await res.text()).toBe(201);
  const { collection } = (await res.json()) as { collection: { id: string; title: string } };
  const made = await request.post(`${API}/documents`, { data: { collectionId: collection.id, path: file, fileid: '801' } });
  expect(made.status(), await made.text()).toBe(201);
  const { document } = (await made.json()) as { document: { id: string; title: string } };
  return { collection, document, file };
}

const capabilities = {
  spacing: { desktop: { spaceAbove: 80 } },
  surface: { desktop: { bg: 'token:accent' } },
  placement: { desktop: { align: 'end' } },
};

async function stored(pageId: string): Promise<{ type: string; attrs: Record<string, unknown> }[]> {
  const [row] = await db<{ doc: { content: { type: string; attrs: Record<string, unknown> }[] } }[]>`select doc from pages where id = ${pageId}`;
  return row.doc.content;
}

/** The block's own stylesheet rule (space above, placement) and its box's (surface, typography). */
const rules = (block: Locator) => block.evaluate((el) => [el.getAttribute('data-b'), el.querySelector('[data-b]')?.getAttribute('data-b') ?? null]);

test.describe('the Nextcloud blocks in the embedding family', () => {

  test('a collection block becomes the folder block when a Nextcloud collection is picked — the same block, its capabilities carried — and Undo turns it back', async ({ page }) => {
    await configure(page.request, mock.origin);
    const { collection, file } = await connect(page.request);
    const shelf = (await (await page.request.post('/api/collections', { data: { title: unique('Shelf').name } })).json()) as { id: string };
    const { id, slug } = await createPage(page.request, {
      visibility: null,
      doc: doc({ type: 'paragraph', content: [txt('Above the block.')] }, { type: 'collectionBlock', attrs: { blockId: 'family-1', nodeId: shelf.id, limit: 5, ...capabilities } }),
    });
    await page.goto(`/${slug}/edit`);
    const block = page.locator('.ProseMirror [data-block-id="family-1"]');
    await expect(block).toHaveClass(/collection-block/);
    await expect(block).toContainText('Nothing in this collection yet.');
    const before = await rules(block);
    expect(before.every(Boolean), JSON.stringify(before)).toBe(true);

    await block.click();
    const panel = blockSettings(page);
    await panel.getByRole('button', { name: 'Change…' }).click();
    const picker = page.getByRole('dialog', { name: 'Choose a collection' });
    await picker.getByPlaceholder('Search collections').fill(collection.title);
    const option = picker.getByRole('option', { name: new RegExp(collection.title) });
    // The row under the pointer says what picking it does.
    await option.hover();
    await expect(option).toContainText('As Nextcloud folder');
    await option.click();
    await expect(picker).toBeHidden();

    await expect(block).toHaveClass(/nc-folder-block/);
    await expect.poll(() => rules(block)).toEqual(before);
    await expect(block.locator('.el-row .el-name-text')).toHaveText(['Q3', file]);
    await expect(panel.getByRole('button', { name: 'Source', exact: true })).toBeVisible();
    await savePage(page, id);
    const [, folder] = await stored(id);
    expect(folder).toEqual({ type: 'nextcloudFolder', attrs: expect.objectContaining({ blockId: 'family-1', collectionId: collection.id, startPath: '', ...capabilities }) });
    expect(folder.attrs).not.toHaveProperty('limit');
    expect(folder.attrs).not.toHaveProperty('nodeId');

    await page.getByText('Above the block.').click();
    await page.keyboard.press('ControlOrMeta+z');
    await expect(block).toHaveClass(/collection-block/);
    await expect.poll(() => rules(block)).toEqual(before);
    await expect(block).toContainText('Nothing in this collection yet.');
    await savePage(page, id);
    const [, back] = await stored(id);
    expect(back).toEqual({ type: 'collectionBlock', attrs: expect.objectContaining({ blockId: 'family-1', nodeId: shelf.id, limit: 5, ...capabilities }) });
  });

  test('a document block becomes the file block when a Nextcloud document is picked, and Undo turns it back', async ({ page }) => {
    await configure(page.request, mock.origin);
    const { document, file } = await connect(page.request);
    const { id, slug } = await createPage(page.request, {
      visibility: null,
      doc: doc({ type: 'paragraph', content: [txt('Above the block.')] }, { type: 'documentBlock', attrs: { blockId: 'family-2', nodeId: null, ...capabilities } }),
    });
    await page.goto(`/${slug}/edit`);
    const block = page.locator('.ProseMirror [data-block-id="family-2"]');
    await expect(block).toContainText('Choose a document in the block settings.');
    const before = await rules(block);
    expect(before.every(Boolean), JSON.stringify(before)).toBe(true);

    await block.click();
    const panel = blockSettings(page);
    await panel.getByRole('button', { name: 'Choose…' }).click();
    const picker = page.getByRole('dialog', { name: 'Choose a document' });
    await picker.getByPlaceholder('Search documents').fill(document.title);
    const option = picker.getByRole('option', { name: new RegExp(document.title) });
    await option.hover();
    await expect(option).toContainText('As Nextcloud file');
    await option.click();

    await expect(block).toHaveClass(/nc-file-block/);
    await expect.poll(() => rules(block)).toEqual(before);
    await expect(block.locator('.de-title-text')).toHaveText(file);
    await savePage(page, id);
    const [, fileBlock] = await stored(id);
    expect(fileBlock).toEqual({ type: 'nextcloudFile', attrs: expect.objectContaining({ blockId: 'family-2', documentId: document.id, ...capabilities }) });

    await page.getByText('Above the block.').click();
    await page.keyboard.press('ControlOrMeta+z');
    await expect(block).toContainText('Choose a document in the block settings.');
    await expect.poll(() => rules(block)).toEqual(before);
  });
});

test.describe('a quick link to a Nextcloud document', () => {
  const quickLink = (documentId: string) => ({
    type: 'quickLink',
    attrs: { blockId: 'family-link', refType: 'document', targetDocId: documentId, label: 'Bericht', variant: 'button', ...capabilities },
  });

  test('becomes the file block, its capabilities carried, while the plugin is on — and says why not while it is off', async ({ page }) => {
    await configure(page.request, mock.origin);
    const { document, file } = await connect(page.request);
    const { id, slug } = await createPage(page.request, { visibility: null, doc: doc({ type: 'paragraph', content: [txt('Above the block.')] }, quickLink(document.id)) });
    await page.goto(`/${slug}/edit`);
    const block = page.locator('.ProseMirror [data-block-id="family-link"]');
    await block.click();
    const embed = page.getByRole('toolbar', { name: 'Block tools' }).getByRole('button', { name: 'Embed as block', exact: true });
    await embed.click();
    await expect(block).toHaveClass(/nc-file-block/);
    await expect(block.locator('.de-title-text')).toHaveText(file);
    await savePage(page, id);
    const [, fileBlock] = await stored(id);
    expect(fileBlock).toEqual({ type: 'nextcloudFile', attrs: expect.objectContaining({ blockId: 'family-link', documentId: document.id, ...capabilities }) });

    await configure(page.request, mock.origin, false);
    const off = await createPage(page.request, { visibility: null, doc: doc(quickLink(document.id)) });
    await page.goto(`/${off.slug}/edit`);
    await page.locator('.ProseMirror [data-block-id="family-link"]').click();
    await expect(embed).toBeDisabled();
    await expect(embed).toHaveAttribute('title', 'Nextcloud is turned off');
  });
});

test.describe('the Nextcloud blocks in the phone editor', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  /** Sets the option in the block's settings sheet and saves; returns the stored attrs. */
  async function setOnPhone(page: Page, pageId: string, slug: string, blockId: string, tapAt: string, option: string) {
    await page.goto(`/${slug}/edit`);
    await page.locator(`.ProseMirror [data-block-id="${blockId}"] ${tapAt}`).first().tap();
    await page.getByRole('button', { name: 'Block settings', exact: true }).tap();
    const sheet = page.getByRole('dialog', { name: 'Block settings' });
    await sheet.getByRole('radio', { name: option, exact: true }).tap();
    await sheet.getByRole('button', { name: 'Close', exact: true }).tap();
    await expect(sheet).toBeHidden();
    const saved = page.waitForResponse((r) => r.request().method() === 'PUT' && new URL(r.url()).pathname === `/api/pages/${pageId}`);
    await page.getByRole('button', { name: 'Save', exact: true }).tap();
    expect((await saved).ok()).toBe(true);
    return (await stored(pageId)).find((b) => b.attrs.blockId === blockId)?.attrs;
  }

  test('have their settings in a sheet, where a change is the block’s and saved', async ({ page }) => {
    await configure(page.request, mock.origin);
    const { collection, document } = await connect(page.request);
    const { id, slug } = await createPage(page.request, {
      visibility: null,
      doc: doc(
        { type: 'nextcloudFolder', attrs: { blockId: 'phone-folder', collectionId: collection.id, startPath: '' } },
        { type: 'nextcloudFile', attrs: { blockId: 'phone-file', documentId: document.id } }
      ),
    });
    // The footer, since tapping a row opens its folder.
    expect(await setOnPhone(page, id, slug, 'phone-folder', '.el-foot', 'Compact')).toMatchObject({ collectionId: collection.id, density: 'compact' });
    expect(await setOnPhone(page, id, slug, 'phone-file', '.de-title-text', 'Card')).toMatchObject({ documentId: document.id, variant: 'card' });
  });
});
