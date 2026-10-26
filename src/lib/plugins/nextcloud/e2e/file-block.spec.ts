// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// E2E because: the block is made in the editor from a file chosen in a share,
// and a reader downloads it and sees its preview, on a phone too. Each test
// lists a share of its own.
import type { APIRequestContext } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { test, expect } from '$tests/e2e/fixtures';
import { createPage } from '$tests/e2e/api';
import { doc, txt } from '$tests/e2e/doc';
import { horizontalOverflow, touchTargets } from '$tests/e2e/responsive';
import { authState } from '$tests/e2e/seed-data';
import { startMockNextcloud, type MockNextcloud, type MockShare } from './mockNextcloud';
import { anonymous } from '$tests/e2e/fixtures';
import { configure } from './settings';
import { blockSettings } from '$tests/e2e/editor';

const API = '/api/plugins/nextcloud';
const PDF = '%PDF-1.4\n% e2e file block\n';
// One transparent pixel.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

let mock: MockNextcloud;
let shares = 0;

const share = (name: string): MockShare => ({
  name,
  files: {
    'Bericht.pdf': { content: PDF, mime: 'application/pdf', fileid: 401, modified: new Date('2026-10-02T09:30:00Z') },
    'Plan.png': { content: PNG, mime: 'image/png', fileid: 402 },
    'Notizen.txt': { content: 'notes', mime: 'text/plain', fileid: 403 },
    'Q3/Protokoll.md': { content: '# Protokoll', mime: 'text/markdown', fileid: 404 },
  },
});

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

/** In the public default namespace, like the pages here. */
async function connect(request: APIRequestContext) {
  const n = ++shares;
  const token = `E2eFile${process.pid}x${n}`;
  mock.shares.set(token, share(`Akten ${process.pid}-${n}`));
  const anchor = await createPage(request, { visibility: null });
  const res = await request.post(`${API}/collections`, { data: { pageId: anchor.id, shareUrl: `${mock.origin}/s/${token}` } });
  expect(res.status(), await res.text()).toBe(201);
  const { collection } = (await res.json()) as { collection: { id: string; href: string; title: string } };
  return { ...collection, token };
}

type Made = { id: string; title: string; href: string };

async function makeDocument(request: APIRequestContext, collectionId: string, path: string, fileid: string): Promise<Made> {
  const res = await request.post(`${API}/documents`, { data: { collectionId, path, fileid } });
  expect(res.status(), await res.text()).toBe(201);
  return ((await res.json()) as { document: Made }).document;
}

const fileNode = (documentId: string, attrs: Record<string, unknown> = {}) => ({
  type: 'nextcloudFile',
  attrs: { blockId: 'file-1', documentId, ...attrs },
});

function filePage(request: APIRequestContext, ...blocks: unknown[]) {
  return createPage(request, { visibility: null, doc: doc({ type: 'paragraph', content: [txt('Above the file.')] }, ...blocks) });
}

test.describe('the Nextcloud file block', () => {
  test('is inserted from the Document group, made a document of a file chosen in a share, and saved', async ({ page }) => {
    await configure(page.request, mock.origin);
    const collection = await connect(page.request);
    const { slug } = await createPage(page.request, { visibility: null });
    await page.goto(`/${slug}/edit`);
    await page.locator('.ProseMirror').click();
    await page.getByRole('button', { name: 'Insert', exact: true }).click();
    await page.getByRole('group', { name: 'Document' }).getByRole('menuitem', { name: 'Nextcloud file' }).click();

    const editorBlock = page.locator('.ProseMirror .de');
    await expect(editorBlock).toContainText('Choose a document in the block settings.');
    await editorBlock.locator('.de-placeholder-body').click();
    const panel = blockSettings(page);
    await panel.getByRole('button', { name: 'Choose from a folder …' }).click();
    const dialog = page.getByRole('dialog', { name: 'Choose a file' });
    await dialog.getByRole('combobox', { name: 'Collection' }).click();
    await page.getByRole('option', { name: collection.title }).click();
    await dialog.getByRole('button', { name: 'Q3' }).click();
    await dialog.getByRole('button', { name: 'Protokoll.md' }).click();
    await dialog.getByRole('button', { name: 'Choose', exact: true }).click();
    await expect(dialog).toBeHidden();

    await expect(editorBlock.locator('.de-title-text')).toHaveText('Protokoll.md');
    await expect(editorBlock.locator('.de-chip')).toContainText('Document');
    await expect(panel.getByText('Reachable', { exact: true })).toBeVisible();
    await expect(panel.getByText(/Protokoll\.md · file id 404/)).toBeVisible();

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Saved')).toBeVisible({ timeout: 15000 });
    await page.reload();
    await expect(page.locator('.ProseMirror .de .de-title-text')).toHaveText('Protokoll.md');
    const html = await (await page.request.get(`/${slug}`)).text();
    expect(html).toContain('class="de-title-text">Protokoll.md</span>');
  });

  test("shows readers a row and a card: one link to the document's content, its download, an image its own preview, any other file its type", async ({ page, browser }) => {
    await configure(page.request, mock.origin);
    const collection = await connect(page.request);
    const pdf = await makeDocument(page.request, collection.id, 'Bericht.pdf', '401');
    const png = await makeDocument(page.request, collection.id, 'Plan.png', '402');
    const { slug } = await filePage(
      page.request,
      fileNode(pdf.id),
      fileNode(png.id, { blockId: 'file-2', variant: 'card', showNodeLink: true }),
      fileNode(pdf.id, { blockId: 'file-3', variant: 'card' })
    );
    const reader = await anonymous(browser);
    const view = await reader.newPage();
    await view.goto(`/${slug}`);

    const row = view.locator('[data-block-id="file-1"] .de');
    await expect(row).toHaveAttribute('data-state', 'ready');
    const entry = row.locator('a.de-entry');
    await expect(entry).toHaveAttribute('href', `/api/documents/${pdf.id}/content`);
    await expect(entry).toHaveAttribute('target', '_blank');
    await expect(row.locator('.de-title-text')).toHaveText('Bericht.pdf');
    await expect(row.locator('.de-meta')).toContainText('PDF · ');
    await expect(row.locator('.de-meta')).toContainText(collection.title);

    // A grant of this reader's own, then the PDF inline.
    const opened = await reader.request.get(`/api/documents/${pdf.id}/content`, { maxRedirects: 0 });
    expect(opened.status()).toBe(302);
    expect(opened.headers()['cache-control']).toContain('no-store');
    expect(opened.headers()['location']).toMatch(new RegExp(`^${API}/file/`));
    const shown = await reader.request.get(opened.headers()['location']);
    expect(shown.headers()['content-type']).toBe('application/pdf');
    expect(shown.headers()['content-disposition']).toMatch(/^inline/);
    expect(await shown.text()).toBe(PDF);

    // The download is left to the browser; the app's router must not take it
    // for a page, which would log a "Not found".
    const errors: string[] = [];
    view.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    const download = row.getByRole('link', { name: 'Download', exact: true });
    await expect(download).toHaveAttribute('href', `/api/documents/${pdf.id}/content?download`);
    await expect(download).toHaveAttribute('download', 'Bericht.pdf');
    const [saved] = await Promise.all([view.waitForEvent('download'), download.click()]);
    expect(saved.suggestedFilename()).toBe('Bericht.pdf');
    expect(await readFile((await saved.path())!, 'utf8')).toBe(PDF);
    expect(errors).toEqual([]);
    const attachment = await reader.request.get(`/api/documents/${pdf.id}/content?download`);
    expect(attachment.headers()['content-disposition']).toMatch(/^attachment/);
    expect(attachment.headers()['x-content-type-options']).toBe('nosniff');

    // A card is titled by its node; the preview loads through the document's content.
    const card = view.locator('[data-block-id="file-2"] .de');
    await expect(card.locator('.de-title-text')).toHaveText(png.title);
    const image = card.locator('img.de-image');
    await image.scrollIntoViewIfNeeded();
    await expect.poll(() => image.evaluate((el: HTMLImageElement) => (el.complete ? el.naturalWidth : 0))).toBe(1);
    await expect(card.getByRole('link', { name: "Open the document's page" })).toHaveAttribute('href', png.href);

    const tile = view.locator('[data-block-id="file-3"] .de');
    await expect(tile.locator('.de-tile-type')).toHaveText('PDF');
    await expect(tile.locator('img')).toHaveCount(0);
    await expect(tile.locator('a.de-entry')).toHaveAttribute('target', '_blank');

    // Strict style-src: no style attribute in the content.
    expect(await view.locator('.canvas-blocks [style]').count()).toBe(0);
    expect(await view.content()).not.toContain(collection.token);
    await reader.close();
  });
});

test.describe('the Nextcloud file block on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('reads as a row a finger can hit, its download an icon, and scrolls nothing sideways', async ({ page, browser }) => {
    await configure(page.request, mock.origin);
    const collection = await connect(page.request);
    const pdf = await makeDocument(page.request, collection.id, 'Bericht.pdf', '401');
    const png = await makeDocument(page.request, collection.id, 'Plan.png', '402');
    const { slug } = await filePage(page.request, fileNode(pdf.id, { showNodeLink: true }), fileNode(png.id, { blockId: 'file-2', variant: 'card' }));
    const reader = await browser.newContext({ storageState: { cookies: [], origins: [] }, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const view = await reader.newPage();
    await view.goto(`/${slug}`);

    const row = view.locator('[data-block-id="file-1"] .de');
    await expect(row).toHaveAttribute('data-state', 'ready');
    const height = await row.locator('.de-entry').evaluate((el) => el.getBoundingClientRect().height);
    expect(height).toBeGreaterThanOrEqual(48);
    // An icon alone.
    const download = row.getByRole('link', { name: 'Download', exact: true });
    await expect(download).toHaveCount(1);
    await expect(download).toHaveAttribute('aria-label', 'Download');

    expect(await horizontalOverflow(view)).toEqual([]);
    expect(await touchTargets(view, '.de')).toEqual([]);
    expect(await view.locator('.canvas-blocks [style]').count()).toBe(0);
    await reader.close();
  });
});
