// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import type { Locator } from '@playwright/test';
import { test, expect } from '$tests/e2e/fixtures';
import { authState } from '$tests/e2e/seed-data';
import { createPage } from '$tests/e2e/api';
import { txt, doc, para, cell } from '$tests/e2e/doc';

// Block spacing (docs/architecture/blocks/capabilities.md, "Block spacing"), measured the same way in the editor and on the page.

const heading = (id: string, level: number) => ({ type: 'heading', attrs: { blockId: id, level }, content: [txt(id)] });

const RHYTHM = 24; // BLOCK_SPACE_DEFAULT (capabilities/spacing/spacing.ts)

/** Every block's computed top margin, keyed by block id. */
const margins = (root: Locator) =>
  root.locator('[data-block-id]').evaluateAll((els) =>
    Object.fromEntries(
      els.map((el) => [el.getAttribute('data-block-id'), getComputedStyle(el).marginTop] as const)
    )
  );

const bottomMargins = (root: Locator) =>
  root.locator('[data-block-id]').evaluateAll((els) => [...new Set(els.map((el) => getComputedStyle(el).marginBottom))]);

test.describe('block spacing', () => {
  test.use({ storageState: authState('admin') });

  test('resolves override ?? type default ?? rhythm, and never sets a bottom margin', async ({ page }) => {
    const { slug } = await createPage(page.request, {
      doc: doc(
        heading('h1', 1),
        para('p1'),
        para('p2'),
        heading('h2', 2),
        // An explicit override beats both the type default and the rhythm.
        para('p3', { spacing: { desktop: { spaceAbove: 80 } } }),
        // 0 is a real value, not "unset" — it must beat the rhythm too.
        para('p4', { spacing: { desktop: { spaceAbove: 0 } } })
      ),
    });
    await page.goto(`/${slug}`);
    await expect(page.getByText('p1')).toBeVisible();

    const m = await margins(page.locator('.page-canvas'));
    expect(m.h1).toBe('0px'); // first block in the flow: flush, by construction
    expect(m.p1).toBe(`${RHYTHM}px`);
    expect(m.p2).toBe(`${RHYTHM}px`);
    expect(m.h2).toBe(`${RHYTHM * 1.75}px`); // the heading's type default
    expect(m.p3).toBe('80px');
    expect(m.p4).toBe('0px');

    expect(await bottomMargins(page.locator('.page-canvas'))).toEqual(['0px']);
  });

  test("a flow's rhythm reaches its contents; a nested flow overrides it", async ({ page }) => {
    const { slug } = await createPage(page.request, {
      doc: {
        type: 'doc',
        attrs: { spacing: { desktop: { blockSpace: 40 } } },
        content: [
          para('top1'),
          para('top2'),
          {
            type: 'grid',
            attrs: { blockId: 'grid', columnWidths: [1, 1] },
            content: [
              // This cell sets its own rhythm; the other inherits the page's.
              { type: 'gridCell', attrs: { spacing: { desktop: { blockSpace: 4 } } }, content: [para('a1'), para('a2')] },
              cell(para('b1'), para('b2')),
            ],
          },
        ],
      },
    });
    await page.goto(`/${slug}`);
    await expect(page.getByText('top1')).toBeVisible();

    const m = await margins(page.locator('.page-canvas'));
    expect(m.top1).toBe('0px');
    expect(m.top2).toBe('40px'); // the page's own rhythm, not the built-in default
    expect(m.grid).toBe('60px'); // a container's type default: 40 x 1.5
    expect(m.a1).toBe('0px'); // first in its cell
    expect(m.a2).toBe('4px'); // the cell's rhythm
    expect(m.b1).toBe('0px');
    expect(m.b2).toBe('40px'); // inherited from the page, through the cell
  });

  // A container's rhythm is its contents'; the space above it is its parent flow's.
  test("a container's own rhythm governs its contents, never the space above itself", async ({ page }) => {
    const body = (kind: 'grid' | 'flexContainer', id: string) => ({
      type: kind,
      attrs: { blockId: id, spacing: { desktop: { blockSpace: 4 } }, ...(kind === 'grid' ? { columnWidths: [1] } : {}) },
      content: [
        {
          type: kind === 'grid' ? 'gridCell' : 'flexCell',
          content: [para(`${id}-x`), para(`${id}-y`)],
        },
      ],
    });
    const { slug } = await createPage(page.request, {
      doc: {
        type: 'doc',
        attrs: { spacing: { desktop: { blockSpace: 40 } } },
        content: [para('lead'), body('grid', 'grid'), body('flexContainer', 'flex')],
      },
    });

    for (const surface of ['/', '/edit'] as const) {
      await page.goto(surface === '/' ? `/${slug}` : `/${slug}/edit`);
      const root = surface === '/' ? page.locator('.page-canvas') : page.locator('.editor .ProseMirror');
      await expect(page.getByText('grid-x')).toBeVisible();
      const m = await margins(root);

      // The containers sit in the PAGE's flow: 40 x 1.5, not their own 4.
      expect(m.grid, surface).toBe('60px');
      expect(m.flex, surface).toBe('60px');
      // Their contents take the container's rhythm.
      expect(m['grid-y'], surface).toBe('4px');
      expect(m['flex-y'], surface).toBe('4px');
      // …and the first block of each cell is still flush.
      expect(m['grid-x'], surface).toBe('0px');
    }
  });

  test('a bleeding hero stays flush at the canvas top at every tier', async ({ page }) => {
    const { slug } = await createPage(page.request, {
      doc: doc(
        {
          type: 'grid',
          attrs: { blockId: 'hero', bleedToTop: true, width: 'full' },
          content: [cell(para('hero-text'))],
        },
        para('after')
      ),
    });
    await page.goto(`/${slug}`);
    await expect(page.getByText('hero-text')).toBeVisible();

    for (const [label, width] of [['desktop', 1280], ['tablet', 880], ['phone', 600]] as const) {
      await page.setViewportSize({ width, height: 900 });
      const canvas = page.locator('.page-canvas');
      await expect.poll(() => canvas.evaluate((el) => getComputedStyle(el).paddingTop), { message: label }).toBe('0px');
      expect(await page.locator('[data-block-id="hero"]').evaluate((el) => getComputedStyle(el).marginTop), label).toBe('0px');
    }
  });

  test('the rhythm cascades by tier, desktop-first', async ({ page }) => {
    const { slug } = await createPage(page.request, {
      doc: {
        type: 'doc',
        attrs: { spacing: { desktop: { blockSpace: 24 }, phone: { blockSpace: 8 } } },
        content: [para('first'), para('second'), heading('h2', 2)],
      },
    });
    await page.goto(`/${slug}`);
    await expect(page.getByText('first')).toBeVisible();

    const at = async (width: number) => {
      await page.setViewportSize({ width, height: 900 });
      await expect.poll(() => margins(page.locator('.page-canvas')).then((m) => m.second)).not.toBe(undefined);
      return margins(page.locator('.page-canvas'));
    };

    let m = await at(1280);
    expect([m.second, m.h2]).toEqual(['24px', '42px']);
    // Tablet sets nothing of its own, so it takes desktop's.
    m = await at(880);
    expect([m.second, m.h2]).toEqual(['24px', '42px']);
    m = await at(600);
    expect([m.second, m.h2]).toEqual(['8px', '14px']);
  });

  test('the editor spaces every block exactly as the page does', async ({ page }) => {
    const { slug } = await createPage(page.request, {
      doc: {
        type: 'doc',
        attrs: { spacing: { desktop: { blockSpace: 32 } } },
        content: [
          heading('h1', 1),
          para('p1'),
          heading('h2', 2),
          para('p2', { spacing: { desktop: { spaceAbove: 64 } } }),
          { type: 'callout', attrs: { blockId: 'callout', variant: 'info' }, content: [txt('note')] },
          { type: 'blockquote', attrs: { blockId: 'quote' }, content: [para('quoted')] },
          { type: 'horizontalRule', attrs: { blockId: 'rule' } },
          {
            type: 'grid',
            attrs: { blockId: 'grid', columnWidths: [1, 1] },
            content: [cell(para('c1'), para('c2')), cell(para('d1'))],
          },
          // An explicit override, not just the type default (a CSS rule, right
          // everywhere): the grid's editor DOM wraps .grid in .layout-wrap,
          // which carries the id and so must carry the var.
          {
            type: 'grid',
            attrs: { blockId: 'grid-override', columnWidths: [1], spacing: { desktop: { spaceAbove: 0 } } },
            content: [cell(para('e1'))],
          },
          {
            type: 'flexContainer',
            attrs: { blockId: 'flex-override', spacing: { desktop: { spaceAbove: 96 } } },
            content: [{ type: 'flexCell', content: [para('f1')] }],
          },
        ],
      },
    });

    await page.goto(`/${slug}`);
    await expect(page.getByText('p1')).toBeVisible();
    const published = await margins(page.locator('.page-canvas'));

    await page.goto(`/${slug}/edit`);
    await expect(page.locator('.editor .grid-cell').first()).toBeVisible();
    const edited = await margins(page.locator('.editor .ProseMirror'));

    // So a regression shared by the editor and the page can't pass as parity.
    expect(published.h1).toBe('0px');
    expect(published.p1).toBe('32px');
    expect(published.h2).toBe('56px'); // 32 x 1.75
    expect(published.p2).toBe('64px'); // the block's own override
    expect(published.grid).toBe('48px'); // 32 x 1.5
    expect(published['grid-override']).toBe('0px'); // beats the 48px type default
    expect(published['flex-override']).toBe('96px');
    expect(edited).toEqual(published);
  });
});
