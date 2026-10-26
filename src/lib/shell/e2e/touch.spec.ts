// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import type { Page } from '@playwright/test';
import { test, expect } from '$tests/e2e/fixtures';
import { authState } from '$tests/e2e/seed-data';
import { createPage } from '$tests/e2e/api';
import { doc, para } from '$tests/e2e/doc';
import { seedProbePage } from '$tests/e2e/probe-doc';
import { horizontalOverflow, touchTargets } from '$tests/e2e/responsive';
import { blockSettings } from '$tests/e2e/editor';

// The touch scale (docs/architecture/responsive.md, "Touch"), in German, whose labels are
// the longer ones.

async function expectFits(page: Page, label: string) {
  await expect.poll(() => touchTargets(page), { message: `${label}: touch targets` }).toEqual([]);
  await expect.poll(() => horizontalOverflow(page), { message: `${label}: overflow` }).toEqual([]);
}

const strip = {
  type: 'flexContainer',
  attrs: { blockId: 'strip' },
  content: [1, 2, 3].map((n) => ({ type: 'flexCell', content: [para(`Zelle ${n}`)] })),
};

test.describe('touch: a phone', () => {
  test.use({ storageState: authState('editorA'), locale: 'de-DE', hasTouch: true, viewport: { width: 390, height: 844 } });

  test('the home page, a page of every block kind, the search overlay and the menu sheet', async ({ page }) => {
    await page.goto('/');
    await expectFits(page, 'home');
    await page.getByRole('button', { name: 'Suche', exact: true }).tap();
    await expect(page.getByRole('combobox')).toBeVisible();
    await expectFits(page, 'search overlay');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Menü', exact: true }).tap();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expectFits(page, 'menu sheet');

    const { slug } = await seedProbePage(page.request);
    await page.goto(`/${slug}`);
    await expectFits(page, 'every block kind');
  });

  test("the phone editor: its tools scroll in a strip, Speichern stays put, and a selected block's delete is the first tool", async ({ page }) => {
    const { slug } = await createPage(page.request, { doc: doc(para('Erster Absatz'), para('Zweiter Absatz')) });
    for (const width of [360, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(`/${slug}/edit`);
      await page.getByText('Zweiter Absatz', { exact: true }).tap();
      const tools = page.locator('.m-tools');
      await expect(tools.getByRole('button').first()).toHaveAccessibleName('Block löschen');
      await expect(tools.getByRole('button', { name: 'Block löschen' })).toBeInViewport();
      await expectFits(page, `phone editor at ${width}px`);
      // More tools than the row holds: the strip scrolls, the save button stays in view.
      expect(await tools.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
      await expect(page.getByRole('button', { name: 'Speichern', exact: true })).toBeInViewport();
    }
    await page.getByRole('button', { name: 'Typografie', exact: true }).tap();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expectFits(page, 'typography sheet');
    await page.keyboard.press('Escape');

    await page.locator('.m-tools').getByRole('button', { name: 'Block löschen' }).tap();
    await expect(page.getByText('Zweiter Absatz', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Erster Absatz', { exact: true })).toBeVisible();
  });
});

test.describe('touch: signed out', () => {
  test.use({ storageState: { cookies: [], origins: [] }, locale: 'de-DE', hasTouch: true, viewport: { width: 390, height: 844 } });

  test('the login form', async ({ page }) => {
    await page.goto('/login');
    await expectFits(page, 'login');
  });
});

test.describe('touch: settings', () => {
  test.describe.configure({ mode: 'parallel' });
  test.use({ storageState: authState('admin'), locale: 'de-DE', hasTouch: true });

  for (const path of ['/settings/branding', '/settings/users', '/settings/schema/properties']) {
    test(`${path} on a phone and a tablet`, async ({ page }) => {
      for (const width of [390, 768]) {
        await page.setViewportSize({ width, height: 1024 });
        await page.goto(path);
        await expectFits(page, `${path} at ${width}px`);
      }
    });
  }

  test('a dialog', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/settings/schema/properties');
    await page.getByRole('button', { name: 'Eigenschaft hinzufügen', exact: true }).tap();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expectFits(page, 'property dialog');
  });
});

test.describe('touch: a tablet', () => {
  test.use({ storageState: authState('editorA'), locale: 'de-DE', hasTouch: true, viewport: { width: 768, height: 1024 } });

  test("the editor's toolbar, block tools and block settings panel", async ({ page }) => {
    const { slug } = await createPage(page.request, { doc: doc(para('Ein Absatz'), strip) });
    await page.goto(`/${slug}/edit`);
    await page.getByText('Ein Absatz', { exact: true }).tap();
    await page.getByRole('button', { name: 'Blockeinstellungen umschalten' }).tap();
    await expect(blockSettings(page, 'Blockeinstellungen')).toBeVisible();
    await expectFits(page, 'editor with a paragraph selected');

    // The flex container's Layout section shows the most controls. On a tablet
    // the panel overlays the canvas, so it closes first.
    await page.getByRole('button', { name: 'Blockeinstellungen schließen' }).tap();
    await page.getByText('Zelle 1', { exact: true }).tap();
    await page.getByRole('button', { name: 'Blockeinstellungen umschalten' }).tap();
    // Up the breadcrumb by tapping it (Escape would close the overlaid panel).
    const crumbs = page.getByRole('navigation', { name: 'Block-Pfad' });
    for (const level of ['Flex-Zelle', 'Flex-Zeile']) {
      await crumbs.getByRole('button', { name: level, exact: true }).tap();
      await expect(crumbs.getByRole('button', { name: level, exact: true })).toHaveAttribute('aria-current', 'true');
    }
    await expectFits(page, 'editor with a flex container selected');
  });

  test('the account menu', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Konto', exact: true }).tap();
    await expect(page.getByRole('menu')).toBeVisible();
    await expectFits(page, 'account menu');
  });

  test("an InfoTip opens on a tap and stays until a second tap, a tap outside or Escape", async ({ page }) => {
    const { slug } = await createPage(page.request, { doc: doc(para('Ein Absatz')) });
    await page.goto(`/${slug}/edit`);
    await page.getByText('Ein Absatz', { exact: true }).tap();
    await page.getByRole('button', { name: 'Blockeinstellungen umschalten' }).tap();
    const tip = blockSettings(page, 'Blockeinstellungen').getByRole('button', { name: /^Auto:/ }).first();
    const text = page.locator('[data-tooltip-content]');

    await tip.tap();
    await expect(text).toBeVisible();
    await tip.tap();
    await expect(text).toHaveCount(0);

    await tip.tap();
    await expect(text).toBeVisible();
    const panel = (await blockSettings(page, 'Blockeinstellungen').boundingBox())!;
    await page.touchscreen.tap(panel.x + 20, panel.y + panel.height - 40);
    await expect(text).toHaveCount(0);

    await tip.tap();
    await expect(text).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(text).toHaveCount(0);
  });
});

// The keyboard covers the screen without resizing the page (docs/architecture/responsive.md,
// "The on-screen keyboard"). No browser here opens a real one, so a stand-in
// visual viewport, what a keyboard shrinks, is shrunk.
const KEYBOARD = 320;
async function standInVisualViewport(page: Page) {
  await page.addInitScript(() => {
    const vv = Object.assign(new EventTarget(), { height: window.innerHeight, width: window.innerWidth, offsetTop: 0, offsetLeft: 0, pageTop: 0, pageLeft: 0, scale: 1 });
    Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true });
    (window as unknown as { keyboard: (h: number) => void }).keyboard = (h) => {
      vv.height = document.documentElement.clientHeight - h;
      vv.dispatchEvent(new Event('resize'));
    };
  });
}
const keyboard = (page: Page, height: number) => page.evaluate((h) => (window as unknown as { keyboard: (h: number) => void }).keyboard(h), height);
const bottomOf = async (locator: import('@playwright/test').Locator) => {
  const box = (await locator.boundingBox())!;
  return box.y + box.height;
};

test.describe('touch: the on-screen keyboard', () => {
  test.use({ storageState: authState('admin'), locale: 'de-DE', hasTouch: true, viewport: { width: 390, height: 844 } });

  test('a dialog stays above it, its footer and the focused field in view', async ({ page }) => {
    await standInVisualViewport(page);
    await page.goto('/settings/schema/properties');
    await page.getByRole('button', { name: 'Eigenschaft hinzufügen', exact: true }).tap();
    const dialog = page.getByRole('dialog');
    const field = dialog.locator('input:not([type=hidden]):visible, textarea:visible').last();
    await field.tap();
    await keyboard(page, KEYBOARD);
    const visible = 844 - KEYBOARD;
    await expect.poll(() => bottomOf(dialog)).toBeLessThanOrEqual(visible);
    expect(await bottomOf(dialog.getByRole('button', { name: 'Speichern', exact: true }))).toBeLessThanOrEqual(visible);
    expect(await bottomOf(field)).toBeLessThanOrEqual(visible);
    await keyboard(page, 0);
    await expect.poll(() => bottomOf(dialog)).toBeGreaterThan(visible);
  });

  test("the phone editor's toolbar and its sheets ride on it", async ({ page }) => {
    await standInVisualViewport(page);
    const { slug } = await createPage(page.request, { doc: doc(para('Ein Absatz')) });
    await page.goto(`/${slug}/edit`);
    await page.getByText('Ein Absatz', { exact: true }).tap();
    await keyboard(page, KEYBOARD);
    const visible = 844 - KEYBOARD;
    await expect.poll(async () => Math.round(await bottomOf(page.locator('.m-toolbar')))).toBe(visible);
    await page.getByRole('button', { name: 'Typografie', exact: true }).tap();
    await expect.poll(async () => Math.round(await bottomOf(page.getByRole('dialog')))).toBe(visible);
  });
});

// A phone held sideways gets the phone shell (PHONE_SHELL_MEDIA), not desktop
// chrome with a sliver of canvas; a desktop window that size keeps the desktop's.
const barAtBottom = (page: Page) =>
  page.getByRole('navigation', { name: 'Hauptnavigation' }).evaluate((nav) => nav.getBoundingClientRect().bottom >= window.innerHeight - 1 && nav.getBoundingClientRect().top > 0);

test.describe('touch: a phone held sideways', () => {
  test.use({ storageState: authState('editorA'), locale: 'de-DE', hasTouch: true, viewport: { width: 844, height: 390 } });

  test('gets the phone shell: the bar at the bottom, nothing sideways, 44px targets', async ({ page }) => {
    await page.goto('/');
    await expect.poll(() => barAtBottom(page)).toBe(true);
    await expectFits(page, 'home, sideways');
  });

  test('edits in the phone editor, the values of the tier its canvas shows, as the phone turns', async ({ page }) => {
    const { slug } = await createPage(page.request, { doc: doc(para('Ein Absatz')) });
    await page.goto(`/${slug}/edit`);
    await expect(page.locator('.m-editor-app')).toBeVisible();
    await expectFits(page, 'phone editor, sideways');
    const sheet = page.getByRole('dialog');
    const tierOf = async () => {
      await page.getByText('Ein Absatz', { exact: true }).tap();
      await page.getByRole('button', { name: 'Typografie', exact: true }).tap();
      await expect(sheet).toBeVisible();
      const tier = (await sheet.locator('.m-tier').innerText()).replace(/\s+/g, ' ').trim();
      await page.keyboard.press('Escape');
      await expect(sheet).toHaveCount(0);
      return tier;
    };
    expect(await tierOf()).toBe('Werte für Tablet');
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('.m-editor-app')).toBeVisible();
    expect(await tierOf()).toBe('Werte für Telefon');
  });
});

test.describe('a desktop window as short as a phone held sideways', () => {
  test.use({ storageState: authState('editorA'), locale: 'de-DE', viewport: { width: 844, height: 390 } });

  test('keeps the desktop shell', async ({ page }) => {
    await page.goto('/');
    await expect.poll(() => barAtBottom(page)).toBe(false);
  });
});

test.describe('a mouse', () => {
  test.use({ storageState: authState('admin'), locale: 'de-DE', viewport: { width: 1280, height: 900 } });

  test('keeps the dense sizes', async ({ page }) => {
    await page.goto('/settings/schema/properties');
    const search = page.getByRole('searchbox').first();
    await expect(search).toBeVisible();
    expect((await search.boundingBox())!.height).toBe(36);
    expect(await search.evaluate((el) => getComputedStyle(el).fontSize)).toBe('15px');
  });
});
