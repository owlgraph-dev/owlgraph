// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { test, expect } from '$tests/e2e/fixtures';
import { authState } from '$tests/e2e/seed-data';
import { createPage } from '$tests/e2e/api';
import { doc, para } from '$tests/e2e/doc';
import { blockSettings } from '$tests/e2e/editor';

// The fixture fails on a CSP violation, so the hydrated island is checked under
// the reader routes' strict CSP (docs/architecture/blocks/anatomy.md, "Svelte leaf blocks").

const button = (id: string, label: string, url: string, extra: Record<string, unknown> = {}) => ({
  type: 'quickLink',
  attrs: { blockId: id, refType: 'url', url, label, variant: 'button', icon: 'link', ...extra },
});

test.describe('the quick-link button as a Svelte island', () => {
  test.use({ storageState: authState('admin') });

  test('hydrates in place on the page and shows an off-site destination while focused', async ({ page }) => {
    const { slug } = await createPage(page.request, {
      doc: doc(para('intro'), button('ext', 'Off site', 'https://example.com/docs', { surface: { desktop: { bg: '#7c3aed' } } }), button('site', 'On site', '/search')),
    });
    await page.goto(`/${slug}`);
    const ext = page.locator('[data-block-id="ext"]');
    const extButton = ext.locator('a.quick-link.quick-link--button');
    // Claimed, not redrawn: a mismatch would empty the target and redraw it.
    await expect(extButton).toHaveAttribute('data-hydrated', 'true');
    expect(await ext.evaluate((el) => el.firstChild?.nodeType === Node.COMMENT_NODE && el.firstChild.textContent)).toBe('[');
    await expect(ext).toHaveAttribute('data-island', 'quickLink');
    await expect(extButton).toHaveAttribute('target', '_blank');
    expect(await page.locator('.canvas-blocks [style]').count(), 'no style attribute on the page').toBe(0);
    // The capability chain still decides the look: the card's own fill, not the chrome's accent.
    expect(await extButton.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(124, 58, 237)');

    const dest = ext.locator('.quick-link-dest');
    await expect(dest).toHaveCount(0);
    await extButton.focus();
    await expect(dest).toHaveText('example.com');
    await page.keyboard.press('Tab');
    await expect(dest).toHaveCount(0);
    // A link into this site has no destination to hint at.
    const site = page.locator('[data-block-id="site"] a.quick-link');
    await expect(site).toHaveAttribute('data-hydrated', 'true');
    await site.focus();
    await expect(page.locator('[data-block-id="site"] .quick-link-dest')).toHaveCount(0);
  });

  test('in the editor: a block to select, updated in place, rebuilt on a variant switch, intact through copy and undo', async ({ page }) => {
    const { slug } = await createPage(page.request, { doc: doc(para('intro'), button('ext', 'Off site', 'https://example.com/docs'), para('outro')) });
    await page.goto(`/${slug}/edit`);
    const wrap = page.locator('.ProseMirror [data-block-id="ext"]');
    const card = wrap.locator('a.quick-link');
    await expect(card).toHaveClass(/\bquick-link--button\b/);
    // Not a link to follow here: out of the tab order, no island marker, no hint.
    await expect(card).toHaveAttribute('tabindex', '-1');
    await expect(wrap).not.toHaveAttribute('data-island');
    await card.hover();
    await expect(wrap.locator('.quick-link-dest')).toHaveCount(0);

    // A click selects the block (the overlay's ring), never follows the link.
    await card.click();
    await expect(page.locator('.block-selected')).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/${slug}/edit$`));
    const panel = blockSettings(page);
    await expect(panel.getByRole('heading', { name: 'Surface' })).toBeVisible();

    // First, on its own: ProseMirror groups edits within half a second into one undo step.
    await page.keyboard.press('Backspace');
    await expect(wrap).toHaveCount(0);
    await page.keyboard.press('Control+z');
    await expect(wrap.locator('.quick-link-label')).toHaveText('Off site');
    await expect(wrap.locator('a.quick-link')).toHaveClass(/\bquick-link--button\b/);
    await wrap.locator('a.quick-link').click();

    // A block settings edit reaches the component without a remount: the wrapper
    // element the ring is measured from is the same node afterwards.
    const before = await wrap.elementHandle();
    const label = panel.getByRole('textbox', { name: 'Label', exact: true });
    await label.fill('Renamed');
    await label.press('Tab');
    await expect(card.locator('.quick-link-label')).toHaveText('Renamed');
    expect(await before!.evaluate((el, current) => el === current, await wrap.elementHandle())).toBe(true);

    // A variant switch changes the card's classes inside the same wrapper.
    await panel.getByRole('radio', { name: 'Link', exact: true }).click();
    await expect(wrap.locator('a.quick-link')).toHaveClass(/\bquick-link--link\b/);
    await panel.getByRole('radio', { name: 'Outline', exact: true }).click();
    await expect(wrap.locator('a.quick-link')).toHaveClass(/\bquick-link--outlined\b/);
    await panel.getByRole('radio', { name: 'Button', exact: true }).click();
    await expect(wrap.locator('a.quick-link')).toHaveClass(/\bquick-link--button\b/);
    await expect(wrap.locator('.quick-link-label')).toHaveText('Renamed');
    expect(await before!.evaluate((el, current) => el === current, await wrap.elementHandle())).toBe(true);

    // Delete here, insert there: the lifecycle a drag or a paste puts the view through.
    await wrap.locator('a.quick-link').click();
    await page.getByRole('button', { name: 'Move block down' }).click();
    const blocks = page.locator('.ProseMirror > [data-block-id]');
    await expect(blocks.last()).toHaveAttribute('data-block-id', 'ext');
    await expect(blocks.last().locator('.quick-link-label')).toHaveText('Renamed');
    await expect(blocks.last().locator('a.quick-link')).toHaveClass(/\bquick-link--button\b/);
  });
});
