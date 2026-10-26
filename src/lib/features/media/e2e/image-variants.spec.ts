// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import sharp from 'sharp';
import type { APIRequestContext } from '@playwright/test';
import { test, expect, sameOrigin } from '$tests/e2e/fixtures';
import { createPage } from '$tests/e2e/api';
import { doc, para } from '$tests/e2e/doc';
import { authState } from '$tests/e2e/seed-data';

// What the server stores and answers is serving.http.test.ts's.

/** A 1600 × 900 photo as a phone saves it: with the camera and the position it was taken at. */
const photo = () =>
  sharp({ create: { width: 1600, height: 900, channels: 3, background: { r: 70, g: 100, b: 140 } } })
    .withExif({ IFD0: { Make: 'PhoneCo', Model: 'X1' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '48/1 8/1 0/1' } })
    .jpeg()
    .toBuffer();

async function uploadPhoto(request: APIRequestContext, pageId: string) {
  const res = await request.post('/api/media', { headers: sameOrigin(), multipart: { pageId, file: { name: 'photo.jpg', mimeType: 'image/jpeg', buffer: await photo() } } });
  expect(res.ok(), 'upload a photo').toBe(true);
  return (await res.json()) as { id: string; size: { width: number; height: number; variants: boolean } | null };
}

test.describe('responsive images', () => {
  test.use({ storageState: authState('editorA') });

  test('a phone loads a copy narrower than the image, on the page and in the editor', async ({ page }) => {
    const { id: pageId, slug } = await createPage(page.request);
    const upload = await uploadPhoto(page.request, pageId);
    const saved = await page.request.put(`/api/pages/${pageId}`, { data: doc(para('Ein Foto'), { type: 'image', attrs: { assetId: upload.id, alt: 'Foto' } }) });
    expect(saved.ok(), 'save the page').toBe(true);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/${slug}`);
    const img = page.getByRole('img', { name: 'Foto' });
    await img.scrollIntoViewIfNeeded();
    await expect.poll(() => img.evaluate((el) => (el as HTMLImageElement).currentSrc)).toMatch(/\?w=640$/);
    // The copy doesn't change the image's displayed size.
    expect(await img.evaluate((el) => Math.round(el.getBoundingClientRect().width))).toBeGreaterThan(300);

    // Once: Tiptap's first drawing of the block asks for the copy the NodeView
    // then shows, never the whole image.
    const editorRequests: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes(`/api/media/${upload.id}`)) editorRequests.push(new URL(r.url()).search);
    });
    await page.goto(`/${slug}/edit`);
    const inEditor = page.locator('.ProseMirror img.page-image');
    await expect(inEditor).toHaveAttribute('srcset', new RegExp(`/api/media/${upload.id}\\?w=640 640w`));
    await expect.poll(() => inEditor.evaluate((el) => (el as HTMLImageElement).currentSrc)).toMatch(/\?w=\d+$/);
    await page.waitForLoadState('networkidle');
    expect(editorRequests).toHaveLength(1);
  });

  test('a background the page opens with is announced in the head, and each tier asks for its own copies', async ({ page }) => {
    const { id: pageId, slug } = await createPage(page.request);
    const upload = await uploadPhoto(page.request, pageId);
    const hero = { type: 'grid', attrs: { blockId: 'hero', surface: { desktop: { image: upload.id } } }, content: [{ type: 'gridCell', content: [para('Willkommen')] }] };
    expect((await page.request.put(`/api/pages/${pageId}`, { data: doc(hero) })).ok(), 'save the page').toBe(true);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/${slug}`);
    const preload = page.locator('head link[rel="preload"][as="image"][media="(max-width: 640px)"]');
    await expect(preload).toHaveAttribute('href', `/api/media/${upload.id}?w=640`);
    await expect(preload).toHaveAttribute('imagesrcset', `/api/media/${upload.id}?w=640 1x, /api/media/${upload.id}?w=1280 2x`);
    await expect(preload).toHaveAttribute('fetchpriority', 'high');
    // The block's row paints its surface (the block itself is its shell).
    const background = () => page.locator('[data-block-id="hero"] > .grid').evaluate((el) => getComputedStyle(el).backgroundImage);
    await expect.poll(background).toContain(`/api/media/${upload.id}?w=640`);
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect.poll(background).toContain(`/api/media/${upload.id}?w=1920`);
  });
});

// A phone's browser can lay the fixed app shell out wider than the phone before
// the page settles, fetching the hero's desktop copy too. Nothing here reads the
// layout while loading: that would force a layout and hide the faulty pass.
test.describe('on a phone, while the page loads', () => {
  test.use({ storageState: authState('editorA'), viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });

  test("the hero is fetched as the phone's copy only", async ({ page }) => {
    const { id: pageId, slug } = await createPage(page.request);
    const hero = await uploadPhoto(page.request, pageId);
    const content = doc({ type: 'grid', attrs: { blockId: 'hero', surface: { desktop: { image: hero.id } } }, content: [{ type: 'gridCell', content: [para('Willkommen')] }] });
    expect((await page.request.put(`/api/pages/${pageId}`, { data: content })).ok(), 'save the page').toBe(true);

    const heroRequests: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes(`/api/media/${hero.id}`)) heroRequests.push(new URL(r.url()).search);
    });
    await page.goto(`/${slug}`);
    await page.waitForLoadState('networkidle');
    expect(heroRequests).toEqual(['?w=1280']);
  });
});

test.describe('print', () => {
  test.use({ storageState: authState('editorA') });

  test('a code block wraps its long lines on paper instead of cutting them at the edge', async ({ page }) => {
    const line = 'const ' + 'aVeryLongIdentifierName'.repeat(8) + ' = 1;';
    const { slug } = await createPage(page.request, { doc: doc({ type: 'codeBlock', attrs: { language: 'ts', blockId: 'code' }, content: [{ type: 'text', text: line }] }) });
    await page.goto(`/${slug}`);
    await page.emulateMedia({ media: 'print' });
    const pre = page.locator('.prose pre').first();
    expect(await pre.evaluate((el) => ({ whiteSpace: getComputedStyle(el).whiteSpace, fits: el.scrollWidth <= el.clientWidth + 1 }))).toEqual({ whiteSpace: 'pre-wrap', fits: true });
  });
});
