// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import type { APIRequestContext, Locator, Page } from '@playwright/test';
import { test, expect, sameOrigin } from '$tests/e2e/fixtures';
import { authState } from '$tests/e2e/seed-data';
import { createPage } from '$tests/e2e/api';
import { db } from '../../../platform/db.server';
import { para, cell } from '$tests/e2e/doc';
import { blockSettings } from '$tests/e2e/editor';

// A real (decodable) 1×1 PNG, and a second one with different bytes.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
const PNG_2 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

const SECTIONS = { mode: 'columns', template: { desktop: [1], tablet: [1], phone: [1] }, preset: 'sections' };
const section = (id: string, attrs: Record<string, unknown>, ...cells: unknown[]) => ({ type: 'pageSection', attrs: { blockId: id, ...attrs }, content: cells });

async function upload(request: APIRequestContext, pageId: string, buffer = PNG, mimeType = 'image/png') {
  return request.post('/api/media', { headers: sameOrigin(), multipart: { pageId, file: { name: 'bg.png', mimeType, buffer } } });
}

async function uploaded(request: APIRequestContext, pageId: string, buffer = PNG): Promise<string> {
  const res = await upload(request, pageId, buffer);
  expect(res.ok(), 'upload an image').toBe(true);
  return ((await res.json()) as { id: string }).id;
}

const bg = (locator: Locator) => locator.evaluate((el) => getComputedStyle(el).backgroundImage);
const minHeight = (locator: Locator) => locator.evaluate((el) => getComputedStyle(el).minHeight);

/** A columns page with a full-width hero: a landscape image on desktop, a portrait one on phones. */
async function heroPage(page: Page) {
  const { id, slug } = await createPage(page.request);
  const wide = await uploaded(page.request, id);
  const tall = await uploaded(page.request, id, PNG_2);
  const hero = section(
    'hero',
    {
      width: 'full',
      columns: 'single',
      surface: { desktop: { image: wide, overlay: '#000000', overlayOpacity: 60 }, phone: { image: tall, imageFocus: 'top' } },
      height: { desktop: { min: '640px' }, phone: { min: '100svh' } },
    },
    cell(para('hero-text'))
  );
  const content = { type: 'doc', attrs: { layout: SECTIONS }, content: [hero, section('next', {}, cell(para('after')))] };
  expect((await page.request.put(`/api/pages/${id}`, { data: content })).ok(), 'save the hero').toBe(true);
  return { slug, wide, tall };
}

test.describe('background images', () => {
  test.use({ storageState: authState('admin'), viewport: { width: 1280, height: 900 } });

  test('an art-directed hero: its image, overlay, scheme and height per tier, the same in the editor', async ({ page }) => {
    const { slug, wide, tall } = await heroPage(page);

    const served = await page.request.get(`/${slug}`);
    expect(await served.text(), 'no style attribute on a reader route').not.toMatch(/<[^>]+\sstyle="/);

    await page.goto(`/${slug}`);
    // The block (its wrapper) is the scheme region; its row paints the surface.
    const block = page.locator('[data-block-id="hero"]');
    const published = block.locator(':scope > .page-section');
    await expect(block).toHaveAttribute('data-scheme', 'dark');
    expect(await bg(published)).toContain('linear-gradient');
    expect(await bg(published)).toContain(`/api/media/${wide}`);
    const desktopBg = await bg(published);
    expect(await minHeight(published)).toBe('640px');
    // Text on the dark scheme region is the dark scheme's.
    expect(await page.getByText('hero-text').evaluate((el) => getComputedStyle(el).color)).toBe('rgb(236, 235, 232)');

    await page.setViewportSize({ width: 390, height: 800 });
    await expect.poll(() => bg(published)).toContain(`/api/media/${tall}`);
    expect(await minHeight(published)).toBe('800px'); // 100svh
    expect(await published.evaluate((el) => getComputedStyle(el).backgroundPosition)).toBe('50% 0%, 50% 0%'); // one per layer: the overlay, the image

    await page.emulateMedia({ media: 'print' });
    expect(await bg(published), 'paper gets no background image').toBe('none');
    await page.emulateMedia({ media: 'screen' });

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/${slug}/edit`);
    const edited = page.locator('.editor .page-section').first();
    await expect.poll(() => bg(edited)).toContain(`/api/media/${wide}`);
    expect(await bg(edited), 'the editor computes what the page does').toBe(desktopBg);
    expect(await minHeight(edited)).toBe('640px');
    await expect(page.locator('.editor [data-scheme="dark"]').first()).toBeVisible();
  });

  test('the block settings panel: pick an image, a scheme and a minimum height, and the page shows them', async ({ page }) => {
    const { id, slug } = await createPage(page.request, {
      doc: { type: 'doc', attrs: { layout: SECTIONS }, content: [section('band', { width: 'full' }, cell(para('band-text')))] },
    });
    await page.goto(`/${slug}/edit`);
    const breadcrumb = page.getByRole('navigation', { name: 'Block ancestry' });
    await page.getByText('band-text', { exact: true }).click();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect(breadcrumb.getByRole('button', { name: 'Section', exact: true })).toHaveAttribute('aria-current', 'true');

    const panel = blockSettings(page);
    await panel.getByRole('radio', { name: 'Image', exact: true }).click();
    const chooser = page.waitForEvent('filechooser');
    await panel.getByRole('button', { name: 'Choose image…' }).click();
    await (await chooser).setFiles({ name: 'band.png', mimeType: 'image/png', buffer: PNG });
    await expect(panel.locator('img')).toBeVisible();
    // No overlay and no scheme: nothing says what the text sits on.
    await expect(panel).toContainText('What sits under the text depends on the image');

    await panel.getByRole('radio', { name: 'Dark', exact: true }).click();
    await expect(panel).not.toContainText('What sits under the text depends on the image');
    await panel.getByRole('combobox', { name: 'Minimum height' }).click();
    await page.getByRole('option', { name: /^Large/ }).click();

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Saved')).toBeVisible({ timeout: 15000 });

    const [row] = await db<{ id: string }[]>`select id from assets where owner_page_id = ${id}`;
    expect(row, 'the uploaded image is kept: the save found its reference').toBeTruthy();

    await page.goto(`/${slug}`);
    const block = page.locator('[data-block-id="band"]');
    const published = block.locator(':scope > .page-section');
    await expect(block).toHaveAttribute('data-scheme', 'dark');
    expect(await bg(published)).toContain(`/api/media/${row.id}`);
    expect(await minHeight(published)).toBe('640px');
  });
});
