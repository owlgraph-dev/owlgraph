// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import type { Page, Locator } from '@playwright/test';
import { test, expect } from '$tests/e2e/fixtures';
import { authState } from '$tests/e2e/seed-data';
import { editorSelection } from '$tests/e2e/editor';
import { createPage } from '$tests/e2e/api';
import { txt, doc } from '$tests/e2e/doc';

/** The page's per-page stylesheet (the head style holding the data-b rules), without the theme's own looks. */
const pageCss = (page: Page) =>
  page.evaluate(() =>
    Array.from(document.head.querySelectorAll('style'), (s) => s.textContent ?? '')
      .filter((text) => text.includes('[data-b='))
      .join('')
  );
/** The data-b id of the span wrapping `text` in rendered markup. */
const ruleIdOf = (html: string, text: string) => {
  const id = new RegExp(`<span data-b="([^"]+)">${text}</span>`).exec(html)?.[1];
  expect(id, `a data-b span around "${text}"`).toBeTruthy();
  return id!;
};

// The editor re-serializes inline styles (a space after each colon).

const fontSize = (locator: Locator) => locator.evaluate((el) => getComputedStyle(el).fontSize);

const SCALED_DOC = doc(
  { type: 'heading', attrs: { level: 1 }, content: [txt('Default title')] },
  { type: 'heading', attrs: { level: 2, typography: { desktop: { size: 'scale:5xl' } } }, content: [txt('Big heading')] },
  { type: 'paragraph', content: [txt('Marked run', [{ type: 'typographySize', attrs: { size: 'scale:2xl' } }])] },
  { type: 'paragraph', attrs: { typography: { desktop: { size: 20 } } }, content: [txt('Literal paragraph')] }
);

test.describe('type scale', () => {
  test.use({ storageState: authState('admin') });

  test('steps and literals render the same in the editor and on the public page', async ({ page }) => {
    const { slug } = await createPage(page.request, { doc: SCALED_DOC });

    await page.goto(`/${slug}`);
    // The article only: the theme stylesheet in the head holds the looks.
    const html = await page.locator('article.prose').innerHTML();
    // A deviation is a per-page rule its data-b names; the article has no style attribute.
    const css = await pageCss(page);
    expect(html).not.toContain('style=');
    // The h1 is set in its style: no inline size, the theme rule sizes it (4xl = 2.25rem on a wide canvas).
    expect(css).not.toContain('--typography-size-d:var(--type-4xl)');
    await expect(page.locator('article.prose h1')).toHaveCSS('font-size', '36px');
    expect(css).toContain('--typography-size-d:var(--type-5xl)');
    expect(css).toContain(`[data-b="${ruleIdOf(html, 'Marked run')}"]{font-size:var(--type-2xl)}`);
    expect(css).toContain('--typography-size-d:20px');
    // The article only: the layout's hydration data holds the stored form.
    expect(await page.locator('article.prose').innerHTML()).not.toContain('scale:');

    await page.goto(`/${slug}/edit`);
    const editor = page.locator('.ProseMirror');
    await expect(editor).toContainText('Literal paragraph');
    const editorHtml = await editor.innerHTML();
    expect(editorHtml).not.toContain('--typography-size-d: var(--type-4xl)');
    await expect(editor.locator('h1')).toHaveCSS('font-size', '36px');
    expect(editorHtml).toContain('--typography-size-d: var(--type-5xl)');
    expect(editorHtml).toContain('data-typo-size="scale:2xl"');
    expect(editorHtml).toContain('font-size: var(--type-2xl)');
    expect(editorHtml).toContain('--typography-size-d: 20px');
  });

  test('large steps shrink with the canvas; a px literal does not', async ({ page }) => {
    const { slug } = await createPage(page.request, { doc: SCALED_DOC });

    await page.setViewportSize({ width: 1600, height: 900 });
    await page.goto(`/${slug}`);
    expect(await fontSize(page.getByRole('heading', { name: 'Default title' }))).toBe('36px');
    expect(await fontSize(page.getByRole('heading', { name: 'Big heading' }))).toBe('48px');
    expect(await fontSize(page.getByText('Marked run'))).toBe('24px');
    expect(await fontSize(page.getByText('Literal paragraph'))).toBe('20px');

    // A canvas at the fluid range's narrow end (360px, typeScale.ts): the floors.
    await page.setViewportSize({ width: 360, height: 800 });
    await page.reload();
    expect(await fontSize(page.getByRole('heading', { name: 'Default title' }))).toBe('28px');
    expect(await fontSize(page.getByRole('heading', { name: 'Big heading' }))).toBe('34px');
    expect(await fontSize(page.getByText('Marked run'))).toBe('24px');
    expect(await fontSize(page.getByText('Literal paragraph'))).toBe('20px');
  });

  test("the editor's phone preview shrinks the canvas, and the large steps with it", async ({ page }) => {
    const { slug } = await createPage(page.request, { doc: SCALED_DOC });
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.goto(`/${slug}/edit`);
    const title = page.locator('.ProseMirror h1');
    await expect(title).toContainText('Default title');
    await expect.poll(() => fontSize(title)).toBe('36px');

    // The 390px preview canvas sits just inside the fluid range: near the
    // 28px floor, well below the full size.
    await page.getByRole('radio', { name: 'Phone preview' }).first().click();
    await expect.poll(async () => parseFloat(await fontSize(title))).toBeLessThan(29);
    expect(parseFloat(await fontSize(title))).toBeGreaterThanOrEqual(28);
  });

  test('the toolbar picks a step first, a custom px second', async ({ page }) => {
    const { slug } = await createPage(page.request, { doc: doc({ type: 'paragraph', content: [txt('Pick a size')] }) });
    await page.goto(`/${slug}/edit`);
    const editor = page.locator('.ProseMirror');
    const trigger = page.getByRole('button', { name: 'Font size', exact: true });
    const scale = page.getByRole('group', { name: 'Scale' });

    // Waits on the editor's own selection, which is what the toolbar decides from.
    async function placeCaret(range: boolean) {
      await page.keyboard.press('Escape');
      await expect(scale).toBeHidden();
      // A just-hidden popover can still take a click: retry until the editor has focus.
      await expect(async () => {
        await editor.getByText('Pick a size').click();
        await expect(editor).toBeFocused({ timeout: 1000 });
      }).toPass({ timeout: 10000 });
      // A click's selection settles after the mouse events and can overwrite a key.
      await expect(async () => {
        await page.keyboard.press('End');
        expect(await editorSelection(editor)).toMatchObject({ text: '', atLineEnd: true });
      }).toPass({ timeout: 10000 });
      // The same settling can undo the extension.
      if (range) {
        await expect(async () => {
          await page.keyboard.press('End');
          await page.keyboard.press('Shift+Home');
          expect((await editorSelection(editor)).text).toBe('Pick a size');
        }).toPass({ timeout: 10000 });
      }
    }

    // Right after one closed, its outside-click handling can take the click:
    // retry, clicking only while it is shut.
    async function openSizes() {
      await expect(async () => {
        if (!(await scale.isVisible())) await trigger.click();
        await expect(scale).toBeVisible({ timeout: 1000 });
      }).toPass({ timeout: 10000 });
    }

    // A text range: the pick becomes a mark.
    await placeCaret(true);
    await openSizes();
    await expect(page.getByRole('group', { name: 'Custom' })).toBeVisible();
    await scale.getByRole('button', { name: '2xl' }).click();
    await expect.poll(() => editor.innerHTML()).toContain('data-typo-size="scale:2xl"');
    await expect(trigger).toContainText('2xl');

    // The same range, a custom px instead: the literal replaces the step.
    await placeCaret(true);
    await openSizes();
    const custom = page.getByRole('combobox', { name: 'Custom font size (px)' });
    await custom.fill('22');
    await custom.press('Enter');
    await expect.poll(() => editor.innerHTML()).toContain('data-typo-size="22"');
    await expect.poll(() => editor.innerHTML()).toContain('font-size: 22px');

    // A caret: the pick goes to the block.
    await placeCaret(false);
    await openSizes();
    await scale.getByRole('button', { name: '5xl' }).click();
    await expect.poll(() => editor.locator('p').first().getAttribute('style')).toMatch(/--typography-size-d:\s*var\(--type-5xl\)/);

    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Saved')).toBeVisible({ timeout: 15000 });
    await page.goto(`/${slug}`);
    const html = await page.content();
    expect(html).toContain('--typography-size-d:var(--type-5xl)');
    expect(await pageCss(page)).toContain(`[data-b="${ruleIdOf(html, 'Pick a size')}"]{font-size:22px}`);
  });
});
