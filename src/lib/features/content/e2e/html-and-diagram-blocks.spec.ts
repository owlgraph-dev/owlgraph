// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { test, expect } from '$tests/e2e/fixtures';
import { authState } from '$tests/e2e/seed-data';
import { createPage } from '$tests/e2e/api';
import { doc, para } from '$tests/e2e/doc';
import type { Page } from '@playwright/test';

const html = (id: string, markup: string, attrs: Record<string, unknown> = {}) => ({ type: 'htmlBlock', attrs: { blockId: id, html: markup, ...attrs } });
const diagram = (id: string, code: string) => ({ type: 'diagram', attrs: { blockId: id, code } });

const inEditor = (page: Page, id: string) => page.locator(`.ProseMirror [data-block-id="${id}"]`);
const onPage = (page: Page, id: string) => page.locator(`.canvas-blocks [data-block-id="${id}"]`);

// Selects the block with a click and replaces its source through the Edit dialog.
async function edit(page: Page, id: string, source: string) {
  const block = inEditor(page, id);
  await block.click();
  await expect(block).toHaveClass(/ProseMirror-selectednode/);
  await page.getByRole('button', { name: 'Edit block', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('.edit-textarea').fill(source);
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).toBeHidden();
}

// A block's box against the content column, which the paragraph `intro` fills.
function placed(page: Page, container: string, id: string) {
  return page.locator(container).evaluate((c, id) => {
    const column = c.querySelector('[data-block-id="intro"]')!.getBoundingClientRect();
    const b = c.querySelector(`[data-block-id="${id}"]`)!.getBoundingClientRect();
    return { right: b.right, width: b.width, contentRight: column.right, contentWidth: column.width };
  }, id);
}

test.describe('the HTML block', () => {
  test.use({ storageState: authState('admin'), viewport: { width: 1280, height: 900 } });

  test('the editor and the page draw its markup, sanitized', async ({ page }) => {
    const { slug } = await createPage(page.request, {
      doc: doc(para('intro'), html('h', '<p>Hello <b>world</b></p><script>window.__xss = 1</script>')),
    });
    await page.goto(`/${slug}/edit`);
    await expect(inEditor(page, 'h').locator('p')).toHaveText('Hello world');
    await expect(inEditor(page, 'h').locator('script')).toHaveCount(0);
    await page.goto(`/${slug}`);
    await expect(onPage(page, 'h').locator('p')).toHaveText('Hello world');
    await expect(onPage(page, 'h').locator('script')).toHaveCount(0);
    expect(await page.evaluate(() => (window as { __xss?: number }).__xss)).toBeUndefined();
  });

  test("a click selects it, and the Edit dialog's change redraws it, sanitized before it is saved", async ({ page }) => {
    const { slug } = await createPage(page.request, { doc: doc(para('intro'), html('h', '<p>Before</p>')) });
    await page.goto(`/${slug}/edit`);
    await expect(inEditor(page, 'h')).toHaveText('Before');
    await edit(page, 'h', '<p>After <b>bold</b></p><img alt="x" onerror="window.__xss = 1"><script>window.__xss = 2</script>');
    await expect(inEditor(page, 'h').locator('p')).toHaveText('After bold');
    await expect(inEditor(page, 'h').locator('script')).toHaveCount(0);
    await expect(inEditor(page, 'h').locator('img')).toHaveCount(1);
    expect(await inEditor(page, 'h').locator('img').getAttribute('onerror')).toBeNull();
    expect(await page.evaluate(() => (window as { __xss?: number }).__xss)).toBeUndefined();
  });

  test('an empty one says so in the editor, and draws nothing on the page', async ({ page }) => {
    const { slug } = await createPage(page.request, { doc: doc(para('intro'), html('h', '')) });
    await page.goto(`/${slug}/edit`);
    await expect(inEditor(page, 'h')).toHaveText(/empty html block/i);
    await page.goto(`/${slug}`);
    await expect(onPage(page, 'h')).toHaveCount(1);
    await expect(onPage(page, 'h')).toHaveText('');
  });

  test('a placed one sits at its place in the editor and on the page, with no style attribute on the page', async ({ page }) => {
    const { slug } = await createPage(page.request, {
      doc: doc(para('intro'), html('h', '<p>Placed at the end</p>', { placement: { desktop: { align: 'end' } } })),
    });
    for (const [path, container] of [[`/${slug}/edit`, '.ProseMirror'], [`/${slug}`, '.canvas-blocks']] as const) {
      await page.goto(path);
      await expect(page.locator(`${container} [data-block-id="h"]`)).toHaveText('Placed at the end');
      const box = await placed(page, container, 'h');
      expect(Math.abs(box.right - box.contentRight), `${container}: at the end`).toBeLessThan(2);
      expect(box.width, `${container}: as wide as its content`).toBeLessThan(box.contentWidth / 2);
    }
    expect(await page.locator('.canvas-blocks [style]').count(), 'no style attribute on the page').toBe(0);
  });
});

test.describe('the diagram block', () => {
  test.use({ storageState: authState('admin'), viewport: { width: 1280, height: 900 } });

  test("the editor draws it, a click selects it, and the Edit dialog's change draws the new one", async ({ page }) => {
    const { slug } = await createPage(page.request, { doc: doc(para('intro'), diagram('d', 'graph TD; A[Alpha]-->B[Beta]')) });
    await page.goto(`/${slug}/edit`);
    const svg = inEditor(page, 'd').locator('svg');
    await expect(svg).toBeVisible({ timeout: 20000 });
    await expect(svg).toContainText('Alpha');
    await edit(page, 'd', 'graph TD; C[Gamma]-->D[Delta]');
    await expect(inEditor(page, 'd').locator('svg')).toContainText('Gamma', { timeout: 20000 });
    await expect(inEditor(page, 'd').locator('svg')).not.toContainText('Alpha');
  });

  test('an empty one says so in the editor, and shows nothing on the page', async ({ page }) => {
    const { slug } = await createPage(page.request, { doc: doc(para('intro'), diagram('d', '')) });
    await page.goto(`/${slug}/edit`);
    await expect(inEditor(page, 'd')).toHaveText(/empty diagram/i);
    await page.goto(`/${slug}`);
    await expect(onPage(page, 'd')).toHaveCount(1);
    await expect(onPage(page, 'd')).toHaveText('');
    await expect(page.locator('iframe.mermaid-frame')).toHaveCount(0);
  });

  test('until it is drawn it says so, in the editor and on the page, and the page never shows its source', async ({ page }) => {
    const { slug } = await createPage(page.request, { doc: doc(para('intro'), diagram('d', 'graph TD; A[Alpha]-->B[Beta]')) });
    // The helper frame never answers: nothing gets drawn.
    await page.route('**/api/embed/mermaid', (route) => route.abort());
    await page.goto(`/${slug}/edit`);
    await expect(inEditor(page, 'd')).toHaveText('Rendering diagram…');
    await expect(inEditor(page, 'd').locator('svg')).toHaveCount(0);
    await page.goto(`/${slug}`);
    await expect(onPage(page, 'd')).toHaveText('Rendering diagram…');
    await expect(onPage(page, 'd').locator('svg')).toHaveCount(0);
    await expect(page.locator('.canvas-blocks')).not.toContainText('Alpha');
  });

  test('an invalid one shows its error, in the editor and on the page', async ({ page }) => {
    const { slug } = await createPage(page.request, { doc: doc(para('intro'), diagram('d', 'this is no diagram')) });
    await page.goto(`/${slug}/edit`);
    await expect(inEditor(page, 'd').locator('.diagram-error')).toContainText(/error/i, { timeout: 20000 });
    await page.goto(`/${slug}`);
    await expect(onPage(page, 'd').locator('.diagram-error')).toContainText(/error/i, { timeout: 20000 });
  });

  test('the page draws one through the frame, and one further down once it scrolls into view, with no style attribute', async ({ page }) => {
    const filler = Array.from({ length: 40 }, (_, i) => para(`p${i}`));
    const { slug } = await createPage(page.request, {
      doc: doc(diagram('d1', 'graph TD; A[Alpha]-->B[Beta]'), ...filler, diagram('d2', 'graph TD; C[Gamma]-->D[Delta]')),
    });
    await page.goto(`/${slug}`);
    const first = onPage(page, 'd1').locator('svg');
    await expect(first).toBeVisible({ timeout: 30000 });
    await expect(first).toContainText('Alpha');
    await expect(page.locator('iframe.mermaid-frame')).toHaveCount(1);
    // Its stylesheet came back as text and went in under the document's nonce.
    await expect(first.locator('style')).toHaveCount(1);
    expect(await first.locator('style').evaluate((el: HTMLStyleElement) => el.nonce)).toBeTruthy();
    // The one below the fold waits for its turn in view.
    await expect(onPage(page, 'd2').locator('svg')).toHaveCount(0);
    await onPage(page, 'd2').scrollIntoViewIfNeeded();
    await expect(onPage(page, 'd2').locator('svg')).toContainText('Gamma', { timeout: 30000 });
    expect(await page.locator('.canvas-blocks [style]').count(), 'no style attribute on the page').toBe(0);
  });

  test('drawn together, each takes the colours of its own place: the page, a dark section', async ({ page }) => {
    const dark = (id: string) => ({ type: 'grid', attrs: { blockId: `s-${id}`, columnWidths: [1], surface: { desktop: { bg: '#1e293b' } } }, content: [{ type: 'gridCell', content: [diagram(id, 'graph LR; C-->D')] }] });
    // Light and dark in turn, all in view at once: their drawings are asked for together.
    const { slug } = await createPage(page.request, { doc: doc(diagram('l1', 'graph LR; A-->B'), dark('d1'), diagram('l2', 'graph LR; A-->B'), dark('d2')) });
    for (const [path, at] of [[`/${slug}`, onPage], [`/${slug}/edit`, inEditor]] as const) {
      await page.goto(path);
      // The drawing's text colour: the first fill of its stylesheet, the diagram's own.
      const textFill = (id: string) => at(page, id).locator('svg').evaluate((svg) => /fill:(#[0-9a-f]{6})/i.exec(svg.querySelector('style')?.textContent ?? '')?.[1].toLowerCase() ?? null);
      // The light palette's text colour on the page, the dark one's in a section.
      for (const id of ['l1', 'l2']) await expect.poll(() => textFill(id), { timeout: 30000 }).toBe('#1d1d1f');
      for (const id of ['d1', 'd2']) await expect.poll(() => textFill(id), { timeout: 30000 }).toBe('#ecebe8');
    }
  });

  test("an adaptive page draws it again when the reader's scheme changes", async ({ page }) => {
    const { slug } = await createPage(page.request, { doc: doc(diagram('d', 'graph TD; A-->B')), contentScheme: 'adaptive' });
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto(`/${slug}`);
    const markup = () => onPage(page, 'd').locator('svg').evaluate((svg) => svg.outerHTML.toLowerCase());
    // The light palette's text colour is in the drawn diagram…
    await expect.poll(markup, { timeout: 30000 }).toContain('#1d1d1f');
    await page.emulateMedia({ colorScheme: 'dark' });
    // …and the dark one once the device switches.
    await expect.poll(markup, { timeout: 30000 }).toContain('#ecebe8');
  });
});
