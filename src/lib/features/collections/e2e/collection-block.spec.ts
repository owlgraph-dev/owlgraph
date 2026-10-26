// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import type { APIRequestContext, Browser, Page } from '@playwright/test';
import { test, expect, waitForHydration } from '$tests/e2e/fixtures';
import { createPage, unique } from '$tests/e2e/api';
import { doc } from '$tests/e2e/doc';
import { horizontalOverflow, touchTargets } from '$tests/e2e/responsive';
import { authState } from '$tests/e2e/seed-data';
import sharp from 'sharp';
import { contrastRatio, parseColor } from '$lib/design-system/theme/color';
import { db } from '../../../platform/db.server';
import { blockSettings } from '$tests/e2e/editor';

test.use({ storageState: authState('admin') });

/** Public (the default namespace) unless restricted. */
async function curated(request: APIRequestContext, opts: { title?: string; restricted?: boolean; namespaceId?: string } = {}) {
  const title = opts.title ?? unique('Reading list').name;
  const res = await request.post('/api/collections', { data: { title, ...(opts.namespaceId ? { namespaceId: opts.namespaceId } : {}) } });
  expect(res.status(), await res.text()).toBe(201);
  const made = (await res.json()) as { id: string; slug: string; namespaceSlug: string | null };
  if (opts.restricted) expect((await request.patch(`/api/collections/${made.id}`, { data: { visibility: 'restricted' } })).ok()).toBe(true);
  return { ...made, title, href: made.namespaceSlug ? `/${made.namespaceSlug}/${made.slug}` : `/${made.slug}` };
}

async function add(request: APIRequestContext, collectionId: string, nodeId: string, label?: string) {
  expect((await request.post(`/api/collections/${collectionId}/members`, { data: { nodeId } })).status()).toBe(201);
  if (label) expect((await request.patch(`/api/collections/${collectionId}/members/${nodeId}`, { data: { label: { en: label } } })).ok()).toBe(true);
}

const publicPage = async (request: APIRequestContext, title = unique('Member page').name, content?: unknown) => ({
  ...(await createPage(request, { visibility: null, title, ...(content ? { doc: content } : {}) })),
  title,
});

const collectionBlock = (blockId: string, nodeId: string, attrs: Record<string, unknown> = {}) => ({ type: 'collectionBlock', attrs: { blockId, nodeId, ...attrs } });

const anonymous = (browser: Browser, viewport?: { width: number; height: number }) =>
  browser.newContext({ storageState: { cookies: [], origins: [] }, ...(viewport ? { viewport } : {}) });

const rows = (scope: Page, blockId: string) => scope.locator(`[data-block-id="${blockId}"] .el-row .el-name-text`);

test.describe('the collection block', () => {
  test('is inserted, picked across namespaces, and lists the members — labelled, a nested collection a row linking to it — in the editor and on the page', async ({ page, browser }) => {
    const c = await curated(page.request);
    const first = await publicPage(page.request);
    const nested = await curated(page.request);
    await add(page.request, c.id, first.id, 'First read');
    await add(page.request, c.id, nested.id);
    const hostTitle = unique('Host page').name;
    const { slug } = await createPage(page.request, { visibility: null, title: hostTitle });

    await page.goto(`/${slug}/edit`);
    await page.locator('.ProseMirror').click();
    await page.getByRole('button', { name: 'Insert', exact: true }).click();
    // The core's kind leads its group. An item's text starts with its icon's, hence the $ anchors.
    await expect(page.getByRole('group', { name: 'Collection' }).getByRole('menuitem').first()).toHaveText(/Curated collection$/);
    await expect(page.getByRole('group', { name: 'Document' }).getByRole('menuitem').first()).toHaveText(/File or link$/);
    await page.getByRole('group', { name: 'Collection' }).getByRole('menuitem', { name: 'Curated collection', exact: true }).click();
    const editorBlock = page.locator('.ProseMirror .collection-block');
    await expect(editorBlock).toContainText('Choose a collection in the block settings.');

    const panel = blockSettings(page);
    await panel.getByRole('button', { name: 'Choose…' }).click();
    const picker = page.getByRole('dialog', { name: 'Choose a collection' });
    await picker.getByPlaceholder('Search collections').fill(c.title);
    await picker.getByRole('option', { name: new RegExp(c.title) }).click();
    await expect(picker).toBeHidden();

    await expect(editorBlock.locator('.el-row .el-name-text')).toHaveText(['First read', nested.title]);
    await expect(panel).toContainText(c.title);
    // The picker closed with the pick, so Escape steps the selection up again.
    const breadcrumb = page.getByRole('navigation', { name: 'Block ancestry' });
    await editorBlock.click();
    await expect(breadcrumb.getByRole('button', { name: 'Collection', exact: true })).toHaveAttribute('aria-current', 'true');
    await page.keyboard.press('Escape');
    await expect(breadcrumb.getByRole('button', { name: 'Page', exact: true })).toHaveAttribute('aria-current', 'true');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Saved')).toBeVisible({ timeout: 15000 });

    const reader = await anonymous(browser);
    const view = await reader.newPage();
    await view.goto(`/${slug}`);
    const block = view.locator('.collection-block');
    await expect(block.locator('.el-row .el-name-text')).toHaveText(['First read', nested.title]);
    await expect(block.locator('.el-row').first().locator('.el-note')).toHaveText(first.title);
    await expect(block.locator('.el-row--folder a.el-entry')).toHaveAttribute('href', nested.href);
    await expect(block).toContainText('2 entries');
    await reader.close();

    await page.goto(c.href);
    await expect(page.getByRole('region', { name: 'Relationships' })).toContainText(hostTitle);
  });

  test("shows at most its limit, with the way to the collection's own page for the rest", async ({ page, browser }) => {
    const c = await curated(page.request);
    for (let i = 0; i < 3; i++) await add(page.request, c.id, (await publicPage(page.request)).id);
    const { slug } = await createPage(page.request, { visibility: null, doc: doc(collectionBlock('limited', c.id, { limit: 2 })) });

    const reader = await anonymous(browser);
    const view = await reader.newPage();
    await view.goto(`/${slug}`);
    await expect(rows(view, 'limited')).toHaveCount(2);
    await expect(view.locator('[data-block-id="limited"]')).toContainText('2 of 3');
    await expect(view.locator('[data-block-id="limited"]').getByRole('link', { name: 'All 3 entries' })).toHaveAttribute('href', c.href);
    await reader.close();

    // The editor reads the collection uncut, yet shows the block as the page does.
    await page.goto(`/${slug}/edit`);
    await expect(rows(page, 'limited')).toHaveCount(2);
    await expect(page.locator('.ProseMirror [data-block-id="limited"]')).toContainText('2 of 3');
  });

  // The rows are the shared EntryList's, so this holds for every block that lists entries.
  test('marks the row under the pointer in the editor, its text readable on any ground — the page’s, and a fill whose text is light on a light page and dark on a dark one', async ({ page }) => {
    const c = await curated(page.request);
    for (let i = 0; i < 2; i++) await add(page.request, c.id, (await publicPage(page.request)).id);
    const filled = collectionBlock('filled', c.id, { surface: { desktop: { bg: 'token:inverse' } } });
    for (const contentScheme of ['light', 'dark'] as const) {
      const { slug } = await createPage(page.request, { visibility: null, contentScheme, doc: doc(collectionBlock('plain', c.id), filled) });
      await page.goto(`/${slug}/edit`);
      for (const blockId of ['plain', 'filled']) {
        const row = page.locator(`.ProseMirror [data-block-id="${blockId}"] .el-row`).nth(1);
        await expect(row.locator('.el-name-text')).not.toBeEmpty();
        await row.scrollIntoViewIfNeeded();
        // A point of the row's ground, clear of its text: inside its padding, under its top border.
        const box = (await row.boundingBox())!;
        const at = { x: Math.round(box.x + 3), y: Math.round(box.y + 3) };
        await page.mouse.move(0, 0);
        const resting = await pixelAt(page, at);
        await row.hover();
        await expect.poll(() => pixelAt(page, at)).not.toEqual(resting);
        const hovered = await pixelAt(page, at);
        const text = parseColor(await row.locator('.el-name-text').evaluate((el) => getComputedStyle(el).color))!;
        expect(contrastRatio(text, hovered), `${contentScheme} ${blockId}: ${JSON.stringify(text)} on ${JSON.stringify(hovered)}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

/** From a screenshot of that one pixel. */
async function pixelAt(page: Page, at: { x: number; y: number }) {
  const png = await page.screenshot({ clip: { x: at.x, y: at.y, width: 1, height: 1 } });
  const { data } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  return { r: data[0], g: data[1], b: data[2], a: 1 };
}

test.describe('the collection block on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('reads in two-line rows a finger can hit, and scrolls nothing sideways', async ({ page }) => {
    const c = await curated(page.request);
    for (let i = 0; i < 2; i++) await add(page.request, c.id, (await publicPage(page.request, unique('A member with a rather long title').name)).id);
    const { slug } = await createPage(page.request, { visibility: null, doc: doc(collectionBlock('phone', c.id)) });
    await page.goto(`/${slug}`);
    await waitForHydration(page);
    await expect(rows(page, 'phone')).toHaveCount(2);
    expect(await horizontalOverflow(page)).toEqual([]);
    expect(await touchTargets(page, '[data-block-id="phone"]')).toEqual([]);
  });

  test('picks its collection on a page of the settings sheet, whose Back returns to the settings as they were', async ({ page }) => {
    const [c, other] = [await curated(page.request), await curated(page.request)];
    await add(page.request, c.id, (await publicPage(page.request)).id);
    const { slug } = await createPage(page.request, { visibility: null, doc: doc(collectionBlock('phone-pick', c.id)) });
    await page.goto(`/${slug}/edit`);
    const block = page.locator('.ProseMirror [data-block-id="phone-pick"]');
    await block.locator('.el-row').first().tap();
    await page.getByRole('button', { name: 'Block settings', exact: true }).tap();
    const settings = page.getByRole('dialog', { name: 'Block settings' });
    await settings.getByRole('radio', { name: 'Compact', exact: true }).tap();
    await settings.getByRole('button', { name: 'Change…' }).tap();

    const sheet = page.getByRole('dialog', { name: 'Choose a collection' });
    await expect(sheet).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await expect(sheet.getByRole('combobox')).toBeFocused();
    await sheet.getByRole('button', { name: 'Back', exact: true }).tap();
    await expect(settings).toBeVisible();
    await expect(settings.getByRole('radio', { name: 'Compact', exact: true })).toHaveAttribute('aria-checked', 'true');
    await expect(settings.getByRole('button', { name: 'Change…' })).toBeFocused();

    await settings.getByRole('button', { name: 'Change…' }).tap();
    await sheet.getByRole('combobox').fill(other.title);
    await sheet.getByRole('option', { name: new RegExp(`^${other.title}`) }).tap();
    await expect(settings).toBeVisible();
    await expect(settings).toContainText(other.title);
    expect(await horizontalOverflow(page)).toEqual([]);
  });

  test('has its settings in a sheet of the phone editor, where a change is the block’s and saved', async ({ page }) => {
    const c = await curated(page.request);
    await add(page.request, c.id, (await publicPage(page.request)).id);
    const { id, slug } = await createPage(page.request, { visibility: null, doc: doc(collectionBlock('phone-settings', c.id)) });
    await page.goto(`/${slug}/edit`);
    const block = page.locator('.ProseMirror [data-block-id="phone-settings"]');
    await block.locator('.el-row').first().tap();
    await page.getByRole('button', { name: 'Block settings', exact: true }).tap();
    const sheet = page.getByRole('dialog', { name: 'Block settings' });
    await expect(sheet).toContainText(c.title);
    await sheet.getByRole('radio', { name: 'Compact', exact: true }).tap();
    await expect(block.locator('.el')).toHaveClass(/el--compact/);
    await sheet.getByRole('button', { name: 'Close', exact: true }).tap();
    await expect(sheet).toBeHidden();

    const saved = page.waitForResponse((r) => r.request().method() === 'PUT' && new URL(r.url()).pathname === `/api/pages/${id}`);
    await page.getByRole('button', { name: 'Save', exact: true }).tap();
    expect((await saved).ok()).toBe(true);
    const [row] = await db<{ doc: { content: { attrs: Record<string, unknown> }[] } }[]>`select doc from pages where id = ${id}`;
    expect(row.doc.content[0].attrs).toMatchObject({ blockId: 'phone-settings', nodeId: c.id, density: 'compact' });
  });
});
