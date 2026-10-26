// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// E2E because: the block is connected in the editor, and browsed, sorted and
// paged by a reader, on a phone too. Each test lists a share of its own, so one
// test's cached reads answer for no other's.
import type { APIRequestContext, Locator, Page } from '@playwright/test';
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
const PDF = '%PDF-1.4\n% e2e\n';

let mock: MockNextcloud;
let shares = 0;

const share = (): MockShare => ({
  name: 'Projektunterlagen',
  files: {
    'Bericht.pdf': { content: PDF, mime: 'application/pdf', fileid: 301, modified: new Date('2026-10-02T09:30:00Z') },
    'Notizen.txt': { content: 'notes', mime: 'text/plain', fileid: 302, modified: new Date('2026-10-05T09:30:00Z') },
    'Zahlen.csv': { content: 'a,b\n1,2\n'.repeat(300), mime: 'text/csv', fileid: 303, modified: new Date('2026-09-20T09:30:00Z') },
    'Q3/Plan.md': { content: '# Plan', mime: 'text/markdown', fileid: 304 },
    'Q3/Archiv/alt.txt': { content: 'old', mime: 'text/plain', fileid: 305 },
  },
  folders: ['Leer'],
});

function newShare(): string {
  const token = `E2eFolder${process.pid}x${++shares}`;
  mock.shares.set(token, share());
  return token;
}

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
async function connect(request: APIRequestContext, token = newShare()) {
  const anchor = await createPage(request, { visibility: null });
  const res = await request.post(`${API}/collections`, { data: { pageId: anchor.id, shareUrl: `${mock.origin}/s/${token}` } });
  expect(res.status(), await res.text()).toBe(201);
  const { collection } = (await res.json()) as { collection: { id: string; href: string; title: string } };
  return { ...collection, token };
}

const folderNode = (collectionId: string, attrs: Record<string, unknown> = {}) => ({
  type: 'nextcloudFolder',
  attrs: { blockId: 'folder-1', collectionId, startPath: '', ...attrs },
});

async function folderPage(request: APIRequestContext, collectionId: string, attrs: Record<string, unknown> = {}, extra: unknown[] = []) {
  return createPage(request, { visibility: null, doc: doc({ type: 'paragraph', content: [txt('Above the folder.')] }, folderNode(collectionId, attrs), ...extra) });
}

const block = (page: Page) => page.locator('.el').first();

test.describe('the Nextcloud folder block', () => {
  test('is inserted from the Collection group, connected to a new share beside its page, and lists it in the editor', async ({ page }) => {
    await configure(page.request, mock.origin);
    const { id, slug } = await createPage(page.request, { visibility: null });
    const token = newShare();
    await page.goto(`/${slug}/edit`);
    await page.locator('.ProseMirror').click();
    await page.getByRole('button', { name: 'Insert', exact: true }).click();
    const group = page.getByRole('group', { name: 'Collection' });
    await expect(group).toBeVisible();
    await group.getByRole('menuitem', { name: 'Nextcloud folder' }).click();

    const editorBlock = page.locator('.ProseMirror .el');
    await expect(editorBlock).toContainText('Choose a collection in the block settings');
    await editorBlock.locator('.el-placeholder-body').click();
    const panel = blockSettings(page);
    await panel.getByRole('button', { name: 'New share …' }).click();
    const dialog = page.getByRole('dialog', { name: 'Connect a share' });
    await dialog.getByRole('textbox', { name: 'Share link' }).fill(`${mock.origin}/s/${token}`);
    await dialog.getByRole('button', { name: 'Connect' }).click();
    await expect(dialog).toBeHidden();

    await expect(editorBlock.locator('.el-row .el-name-text')).toHaveText(['Leer', 'Q3', 'Bericht.pdf', 'Notizen.txt', 'Zahlen.csv']);
    await expect(panel.getByText('Reachable · 5 entries')).toBeVisible();

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Saved')).toBeVisible({ timeout: 15000 });

    await page.reload();
    await expect(page.locator('.ProseMirror .el .el-row').first()).toContainText('Leer');
    await page.locator('.ProseMirror .el .el-provenance').click();
    const open = blockSettings(page).getByRole('link', { name: /Open collection/ });
    const href = await open.getAttribute('href');
    expect((await page.request.get(href!)).status()).toBe(200);
    expect(id).toBeTruthy();
  });

  test("shows readers of a public page the listing: rendered by the server once held, kept current by its island, browsed, sorted and paged", async ({ page, browser }) => {
    await configure(page.request, mock.origin);
    const collection = await connect(page.request);
    const { slug } = await folderPage(page.request, collection.id, { pageSize: 2 });
    const reader = await anonymous(browser);
    const view = await reader.newPage();

    // Cold cache: the server renders the skeleton, the island fetches.
    const first = await reader.request.get(`/${slug}`);
    expect(await first.text()).toContain('data-state="loading"');
    await view.goto(`/${slug}`);
    const listing = block(view);
    await expect(listing).toHaveAttribute('data-state', 'ready');
    await expect(listing.locator('.el-row .el-name-text')).toHaveText(['Leer', 'Q3']);
    await expect(listing.locator('.el-provenance')).toContainText('2 of 5');

    // Held: the server renders the rows.
    const second = await (await reader.request.get(`/${slug}`)).text();
    expect(second).toContain('data-state="ready"');
    expect(second).toContain('>Q3<');

    await listing.getByRole('button', { name: 'Load more' }).click();
    await expect(listing.locator('.el-row')).toHaveCount(4);
    await expect(listing.locator('.el-provenance')).toContainText('4 of 5');
    await listing.locator('.el-row', { hasText: 'Q3' }).getByRole('button').click();
    await expect(listing.getByRole('navigation', { name: 'Folder path' })).toContainText('Q3');
    await expect(listing.locator('.el-row .el-name-text')).toHaveText(['Archiv', 'Plan.md']);
    await listing.getByRole('navigation', { name: 'Folder path' }).getByRole('button', { name: 'Projektunterlagen' }).click();
    await expect(listing.locator('.el-row').first()).toContainText('Leer');

    // By size, largest first; folders stay first.
    await listing.getByRole('button', { name: 'Sorted by Name, ascending' }).click();
    await view.getByRole('menuitem', { name: 'Size' }).click();
    await expect(listing.getByRole('button', { name: 'Sorted by Size, descending' })).toBeVisible();
    await listing.getByRole('button', { name: 'Load more' }).click();
    await expect(listing.locator('.el-row .el-name-text')).toHaveText(['Q3', 'Leer', 'Zahlen.csv', 'Bericht.pdf']);

    const href = await listing.locator('a.el-entry', { hasText: 'Bericht.pdf' }).getAttribute('href');
    expect(href).toMatch(new RegExp(`^${API}/open\\?c=${collection.id}&p=Bericht.pdf&f=301$`));
    expect(await (await reader.request.get(href!)).text()).toBe(PDF);

    // A file a browser cannot show downloads; the app's router must not take it
    // for a page, which would log a "Not found".
    const errors: string[] = [];
    view.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    const [csv] = await Promise.all([view.waitForEvent('download'), listing.locator('a.el-entry', { hasText: 'Zahlen.csv' }).click()]);
    expect(csv.suggestedFilename()).toBe('Zahlen.csv');
    expect(errors).toEqual([]);

    // Strict style-src: no style attribute in the content.
    expect(await view.locator('.canvas-blocks [style]').count()).toBe(0);
    await reader.close();
  });

  test('draws its controls in the scheme of the scheme region it sits in', async ({ page }) => {
    await configure(page.request, mock.origin);
    const collection = await connect(page.request);
    const region = {
      type: 'grid',
      attrs: { columnWidths: [1] },
      content: [{ type: 'gridCell', attrs: { surface: { desktop: { bg: '#0f172a' } } }, content: [folderNode(collection.id, { blockId: 'folder-dark' })] }],
    };
    const { slug } = await folderPage(page.request, collection.id, {}, [region]);
    await page.goto(`/${slug}`);
    const light = page.locator('[data-block-id="folder-1"]').getByRole('button', { name: 'Refresh' });
    const dark = page.locator('[data-block-id="folder-dark"]').getByRole('button', { name: 'Refresh' });
    await expect(dark).toBeVisible();
    const brightness = async (l: Locator) => {
      const [r, g, b] = (await l.evaluate((el) => getComputedStyle(el).color)).match(/\d+/g)!.map(Number);
      return (r + g + b) / 3;
    };
    expect(await brightness(dark)).toBeGreaterThan(180);
    expect(await brightness(light)).toBeLessThan(100);
  });
});

test.describe('the Nextcloud folder block on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('reads in two-line rows a finger can hit, sorts through a sheet, and scrolls nothing sideways', async ({ page, browser }) => {
    await configure(page.request, mock.origin);
    const collection = await connect(page.request);
    const { slug } = await folderPage(page.request, collection.id);
    const reader = await browser.newContext({ storageState: { cookies: [], origins: [] }, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const view = await reader.newPage();
    await view.goto(`/${slug}`);
    const listing = block(view);
    await expect(listing).toHaveAttribute('data-state', 'ready');

    const fileRow = listing.locator('.el-row', { hasText: 'Bericht.pdf' });
    await expect(fileRow.locator('.el-meta')).toBeVisible();
    await expect(listing.locator('.el-cols')).toBeHidden();
    const height = await fileRow.locator('.el-entry').evaluate((el) => el.getBoundingClientRect().height);
    expect(height).toBeGreaterThanOrEqual(48);
    const errors: string[] = [];
    view.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    const [saved] = await Promise.all([view.waitForEvent('download'), fileRow.getByRole('link', { name: 'Download Bericht.pdf' }).tap()]);
    expect(saved.suggestedFilename()).toBe('Bericht.pdf');
    expect(errors).toEqual([]);
    await expect(listing).toHaveAttribute('data-state', 'ready');

    // A pick in the sheet waits for Apply; Cancel keeps the sort.
    await listing.getByRole('button', { name: 'Sorted by Name, ascending' }).click();
    const sheet = view.getByRole('dialog', { name: 'Sort' });
    await sheet.getByRole('button', { name: /Size/ }).click();
    await sheet.getByRole('button', { name: 'Cancel' }).click();
    await expect(listing.getByRole('button', { name: 'Sorted by Name, ascending' })).toBeVisible();
    await listing.getByRole('button', { name: 'Sorted by Name, ascending' }).click();
    await sheet.getByRole('button', { name: /Modified/ }).click();
    await sheet.getByRole('button', { name: 'Apply' }).click();
    await expect(listing.getByRole('button', { name: 'Sorted by Modified, descending' })).toBeVisible();
    await expect(listing.locator('.el-row .el-name-text')).toHaveText(['Leer', 'Q3', 'Notizen.txt', 'Bericht.pdf', 'Zahlen.csv']);

    expect(await horizontalOverflow(view)).toEqual([]);
    expect(await touchTargets(view, '.el')).toEqual([]);
    await reader.close();
  });
});
