// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import type { Page } from '@playwright/test';
import { test, expect } from '$tests/e2e/fixtures';
import { authState } from '$tests/e2e/seed-data';
import { createPage, uploadImage } from '$tests/e2e/api';
import { para, cell } from '$tests/e2e/doc';

// The hard case: an image past the page's opening is lazy with `sizes="auto"`,
// and the browser contains such an image's size, so it needs a ratio to stand
// in for its own (docs/architecture/media.md).

const image = (id: string, assetId: string, attrs: Record<string, unknown> = {}) => ({ type: 'image', attrs: { blockId: id, assetId, alt: id, ...attrs } });
const section = (id: string, ...cells: unknown[]) => ({ type: 'pageSection', attrs: { blockId: id, width: 'wide' }, content: cells });

const article = (assetId: string) => ({
  type: 'doc',
  attrs: { layout: { mode: 'columns', template: { desktop: [2, 1], tablet: [2, 1], phone: [1] }, preset: 'main-aside' } },
  content: [
    section('s1', cell(para('p1')), cell(para('n1'))),
    section('s2', cell(para('p2')), cell(para('n2'))),
    // Past the page's opening two blocks: loaded lazily (leadImage.ts).
    section('s3', cell(para('p3')), cell(image('aside', assetId))),
    section('s4', cell(image('fitted', assetId, { boxMode: 'height', boxHeight: 200 })), cell(para('n4'))),
  ],
});

interface Drawn {
  /** The width of the frame the image sits in: its column's content. */
  frame: number;
  width: number;
  height: number;
  /** The picture's own ratio, as loaded. */
  picture: number;
  /** The width of the file the browser picked. */
  copy: number;
  dpr: number;
  fit: string;
  /** Its corners: square, so no picture loses its own (a logo's lettering). */
  radius: string;
}

/** The image block `id` under `root`, once it has loaded. */
async function drawn(page: Page, root: string, id: string, originalWidth: number): Promise<Drawn> {
  const img = page.locator(`${root} [data-block-id="${id}"] img.page-image`);
  await img.scrollIntoViewIfNeeded();
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0), { message: `${root} ${id} loads` }).toBe(true);
  return img.evaluate((el: HTMLImageElement, original) => {
    const box = el.getBoundingClientRect();
    const copy = /[?&]w=(\d+)/.exec(el.currentSrc);
    return {
      frame: el.parentElement!.getBoundingClientRect().width,
      width: box.width,
      height: box.height,
      picture: el.naturalWidth / el.naturalHeight,
      copy: copy ? Number(copy[1]) : original,
      dpr: devicePixelRatio,
      fit: getComputedStyle(el).objectFit,
      radius: getComputedStyle(el).borderRadius,
    };
  }, originalWidth);
}

/** Within 1 %: boxes are laid out on fractional pixels. */
const near = (actual: number, expected: number, label: string) =>
  expect(Math.abs(actual / expected - 1), `${label}: ${actual.toFixed(3)} vs ${expected.toFixed(3)}`).toBeLessThan(0.01);

const DEVICES = [
  { name: 'desktop', use: { viewport: { width: 1280, height: 900 } } },
  { name: 'phone', use: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } },
];

for (const device of DEVICES) {
  test.describe(`image parity on a ${device.name}`, () => {
    test.use({ storageState: authState('editorA'), ...device.use });

    test('an image in an aside, and a fitted one, are drawn alike on the page and in the editor', async ({ page }) => {
      const { id: pageId, slug } = await createPage(page.request);
      const photo = await uploadImage(page.request, pageId);
      expect((await page.request.put(`/api/pages/${pageId}`, { data: article(photo.id) })).ok(), 'save the page').toBe(true);
      const ratio = photo.width / photo.height;

      await page.goto(`/${slug}`);
      const published = { aside: await drawn(page, '.canvas-blocks', 'aside', photo.width), fitted: await drawn(page, '.canvas-blocks', 'fitted', photo.width) };
      await page.goto(`/${slug}/edit`);
      const edited = { aside: await drawn(page, '.ProseMirror', 'aside', photo.width), fitted: await drawn(page, '.ProseMirror', 'fitted', photo.width) };

      for (const [surface, d] of [['page', published], ['editor', edited]] as const) {
        // The copy is no narrower than the box needs: `sizes` names the column's width.
        near(d.aside.picture, ratio, `${surface}: the copy's ratio`);
        near(d.aside.width / d.aside.height, ratio, `${surface}: the box's ratio`);
        near(d.aside.width, d.aside.frame, `${surface}: the box fills its column`);
        expect(d.aside.copy, `${surface}: the copy is wide enough`).toBeGreaterThanOrEqual(Math.min(photo.width, Math.floor(d.aside.width * d.aside.dpr)));
        // The whole picture shows: no corner is cut off.
        expect(d.aside.radius, `${surface}: square corners`).toBe('0px');
        expect(Math.round(d.fitted.height), `${surface}: the fitted height`).toBe(200);
        near(d.fitted.width, Math.min(d.fitted.frame, 200 * ratio), `${surface}: the fitted width`);
        expect(d.fitted.fit).toBe('cover');
      }
      // A share of the column: the desktop editor's canvas is narrower than the page.
      near(edited.aside.width / edited.aside.frame, published.aside.width / published.aside.frame, 'editor vs page: the share of the column');
      near(edited.aside.width / edited.aside.height, published.aside.width / published.aside.height, "editor vs page: the box's ratio");
      if (device.name === 'phone') {
        near(edited.aside.width, published.aside.width, 'editor vs page: the width');
        near(edited.aside.height, published.aside.height, 'editor vs page: the height');
      }
    });
  });
}
