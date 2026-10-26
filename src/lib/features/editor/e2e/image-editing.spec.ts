// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { test, expect } from '$tests/e2e/fixtures';
import { authState } from '$tests/e2e/seed-data';
import { createPage, uploadImage } from '$tests/e2e/api';
import { doc, para } from '$tests/e2e/doc';
import type { Page } from '@playwright/test';
import { blockSettings } from '$tests/e2e/editor';

const image = (id: string, assetId: string, attrs: Record<string, unknown> = {}) => ({ type: 'image', attrs: { blockId: id, assetId, alt: id, ...attrs } });

async function imagePage(page: Page, ...blocks: ((assetId: string) => unknown)[]) {
  const { id, slug } = await createPage(page.request);
  const upload = await uploadImage(page.request, id);
  const put = await page.request.put(`/api/pages/${id}`, { data: doc(para('intro'), ...blocks.map((b) => b(upload.id)), para('outro')) });
  expect(put.ok(), 'save the page').toBe(true);
  return slug;
}

// Measured once the image has loaded.
async function geometry(page: Page, id: string) {
  const frame = page.locator(`.ProseMirror [data-block-id="${id}"]`);
  await expect.poll(() => frame.locator('img.page-image').evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
  return frame.evaluate((f) => {
    const box = (el: Element | null) => { if (!el) return null; const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, width: r.width, height: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 }; };
    return { frame: box(f)!, img: box(f.querySelector('img.page-image'))!, grip: box(f.querySelector('.img-resize-handle')) };
  });
}

async function drag(page: Page, from: { cx: number; cy: number }, dx: number) {
  await page.mouse.move(from.cx, from.cy);
  await page.mouse.down();
  await page.mouse.move(from.cx + dx / 2, from.cy, { steps: 4 });
  await page.mouse.move(from.cx + dx, from.cy, { steps: 4 });
  await page.mouse.up();
}

const customWidth = (page: Page) => blockSettings(page).getByRole('spinbutton', { name: 'Custom width', exact: true });

test.describe('editing an image', () => {
  test.use({ storageState: authState('admin'), viewport: { width: 1280, height: 900 } });

  test('the grip on a centred image resizes it from the centre, in one undo step', async ({ page }) => {
    const slug = await imagePage(page, (a) => image('img', a, { width: 60 }));
    await page.goto(`/${slug}/edit`);
    const before = await geometry(page, 'img');
    expect(before.grip!.cx).toBeCloseTo(before.img.right, -1);
    expect(before.grip!.cy).toBeCloseTo(before.img.cy, -1);
    await page.mouse.move(before.img.cx, before.img.cy);
    await drag(page, before.grip!, -60);
    // Centred, it shrinks on both sides: 60 px in from its edge is 120 px off its width.
    await expect.poll(async () => Math.round((await geometry(page, 'img')).img.width)).toBeLessThan(Math.round(before.img.width) - 100);
    const after = await geometry(page, 'img');
    expect(after.img.width).toBeCloseTo(before.img.width - 120, -1);
    expect(after.grip!.cx).toBeCloseTo(after.img.right, -1);
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(async () => Math.round((await geometry(page, 'img')).img.width)).toBe(Math.round(before.img.width));
  });

  test('an image placed at the end has its grip on the left, and a drag measures from its right edge', async ({ page }) => {
    const slug = await imagePage(page, (a) => image('img', a, { width: 50, placement: { desktop: { align: 'end' } } }));
    await page.goto(`/${slug}/edit`);
    const before = await geometry(page, 'img');
    expect(before.img.right).toBeCloseTo(before.frame.right, -1);
    expect(before.grip!.cx).toBeCloseTo(before.img.left, -1);
    await page.mouse.move(before.img.cx, before.img.cy);
    await drag(page, before.grip!, -50);
    await expect.poll(async () => Math.round((await geometry(page, 'img')).img.width)).toBeGreaterThan(Math.round(before.img.width) + 30);
    const after = await geometry(page, 'img');
    expect(after.img.width).toBeCloseTo(before.img.width + 50, -1);
    expect(after.img.right).toBeCloseTo(before.frame.right, -1);
  });

  test("in a preview the grip writes that viewport's width alone", async ({ page }) => {
    const slug = await imagePage(page, (a) => image('img', a, { width: 60 }));
    await page.goto(`/${slug}/edit`);
    await page.getByRole('radio', { name: 'Tablet preview' }).click();
    const img = page.locator('.ProseMirror [data-block-id="img"] img.page-image');
    await img.click();
    await expect(customWidth(page)).toHaveValue('');
    const before = await geometry(page, 'img');
    await page.mouse.move(before.img.cx, before.img.cy);
    await drag(page, before.grip!, -40);
    await expect.poll(async () => Number(await customWidth(page).inputValue())).toBeGreaterThan(0);
    const tablet = Number(await customWidth(page).inputValue());
    expect(tablet).toBeLessThan(60);
    await page.getByRole('radio', { name: 'Desktop preview' }).click();
    await expect(customWidth(page)).toHaveValue('60');
  });

  test('an image in fill mode has no grip', async ({ page }) => {
    const slug = await imagePage(page, (a) => image('img', a, { boxMode: 'fill' }));
    await page.goto(`/${slug}/edit`);
    const img = page.locator('.ProseMirror [data-block-id="img"] img.page-image');
    await img.hover();
    await expect(page.locator('.ProseMirror [data-block-id="img"] .img-resize-handle')).toBeHidden();
  });

  test('a click selects the image, and its outline stays through a block settings edit', async ({ page }) => {
    const slug = await imagePage(page, (a) => image('img', a, { width: 60 }));
    await page.goto(`/${slug}/edit`);
    const frame = page.locator('.ProseMirror [data-block-id="img"]');
    await frame.locator('img.page-image').click();
    await expect(frame).toHaveClass(/ProseMirror-selectednode/);
    const alt = blockSettings(page).getByRole('textbox', { name: 'Alt text', exact: true });
    await alt.fill('A new description');
    await alt.press('Tab');
    await expect(frame.locator('img.page-image')).toHaveAttribute('alt', 'A new description');
    await expect(frame).toHaveClass(/ProseMirror-selectednode/);
  });

  test('an image dragged by itself onto another place moves there', async ({ page }) => {
    const slug = await imagePage(page, (a) => image('img', a, { width: 40 }));
    await page.goto(`/${slug}/edit`);
    const g = await geometry(page, 'img');
    const outro = (await page.locator('.ProseMirror > [data-block-id="outro"]').boundingBox())!;
    // Grabbed at the lower left, clear of the hovered block's tools at its top right.
    await page.mouse.move(g.img.left + 20, g.img.top + g.img.height * 0.75);
    await page.mouse.down();
    await page.mouse.move(outro.x + outro.width / 2, outro.y + outro.height / 2, { steps: 10 });
    await page.mouse.move(outro.x + outro.width / 2, outro.y + outro.height - 2, { steps: 4 });
    await page.mouse.up();
    await expect.poll(() => page.locator('.ProseMirror').evaluate((el) => [...el.children].map((c) => c.getAttribute('data-block-id')))).toEqual(['intro', 'outro', 'img']);
  });
});
