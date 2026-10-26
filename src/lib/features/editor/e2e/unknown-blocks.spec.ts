// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// docs/architecture/blocks/anatomy.md, "Unknown blocks". The kinds are invented: a plugin that is
// merely turned off keeps its kinds known.
import type { Page } from '@playwright/test';
import { test, expect } from '$tests/e2e/fixtures';
import { createPage, uploadImage } from '$tests/e2e/api';
import { authState } from '$tests/e2e/seed-data';
import { db } from '../../../platform/db.server';
import { textPara } from '$tests/e2e/doc';
import { storedDoc } from '$tests/support/storedDoc';
import { endOfLine, savePage } from '$tests/e2e/editor';

test.use({ storageState: authState('admin') });

type Node = { type: string; attrs?: Record<string, unknown>; content?: Node[]; marks?: { type: string; attrs?: Record<string, unknown> }[]; text?: string };

/** A page of the admin's, anyone may read it, holding every kind of unknown unit — and an asset only one of them uses. */
async function unknownPage(page: Page) {
  const { id, slug } = await createPage(page.request, { visibility: null });
  const asset = await uploadImage(page.request, id, { width: 400, height: 300 });
  const units: Node[] = [
    { type: 'retiredWidget', attrs: { blockId: 'w-top', zeta: 1, alpha: null, image: asset.id, surface: { desktop: { bg: '#123456' } }, spacing: { desktop: { spaceAbove: 48 } } } },
    { type: 'retiredLeaf', attrs: { setting: 'no id' } },
    { type: 'retiredTabs', attrs: { blockId: 'tabs-1' }, content: [textPara('in-tabs', 'Text inside the tabs')] },
    textPara('p-marked', 'Text under a retired mark', [{ type: 'retiredHighlight', attrs: { tone: 'gold' } }]),
  ];
  const grid: Node = {
    type: 'grid',
    attrs: { blockId: 'grid-1', columnWidths: [1, 1] },
    content: [
      { type: 'gridCell', content: [textPara('p-left', 'Left column'), { type: 'retiredWidget', attrs: { blockId: 'w-cell' } }] },
      { type: 'gridCell', content: [textPara('p-right', 'Right column')] },
    ],
  };
  const doc = {
    type: 'doc',
    content: [textPara('p-first', 'First paragraph'), ...units, grid, textPara('p-link', 'A web link', [{ type: 'link', attrs: { href: 'https://example.org/' } }])],
  };
  expect((await page.request.put(`/api/pages/${id}`, { data: doc })).ok()).toBe(true);
  return { id, slug, asset: asset.id };
}

/** The doc's nodes of the given types (and retired-mark paragraphs), wherever they sit. */
function nodesOf(doc: { content?: Node[] }, types: string[]): Node[] {
  const out: Node[] = [];
  const walk = (n: Node) => {
    if (types.includes(n.type) || (n.content ?? []).some((c) => c.marks?.some((m) => m.type === 'retiredHighlight'))) out.push(n);
    else (n.content ?? []).forEach(walk);
  };
  (doc.content ?? []).forEach(walk);
  return out;
}

const UNKNOWN = ['retiredWidget', 'retiredLeaf', 'retiredTabs'];

test.describe('unknown blocks', () => {
  test('open in the editor beside everything else, and a save keeps them exactly as they were — the asset only one of them uses too', async ({ page }) => {
    const { id, slug, asset } = await unknownPage(page);
    const seeded = nodesOf(await storedDoc(id), UNKNOWN);
    expect(seeded).toHaveLength(5);

    await page.goto(`/${slug}/edit`);
    const editor = page.locator('.ProseMirror');
    await expect(editor).toContainText('First paragraph');
    await expect(editor).toContainText('Left column');
    await expect(editor).toContainText('A web link');
    await expect(editor.locator('.unknown-block')).toHaveCount(5);
    await expect(editor.locator('[data-block-id="w-top"]')).toContainText('Unknown block: retiredWidget');
    await expect(editor).not.toContainText('Text inside the tabs');

    await editor.getByText('A web link').click();
    await endOfLine(page, page.locator('.ProseMirror'));
    await page.keyboard.type(' (edited)');
    await savePage(page, id);
    const first = await storedDoc(id);
    expect(nodesOf(first, UNKNOWN)).toEqual(seeded);
    const linkPara = first.content.find((n) => n.attrs?.blockId === 'p-link')!;
    expect(linkPara.content).toEqual([
      { type: 'text', text: 'A web link', marks: [{ type: 'link', attrs: { href: 'https://example.org/' } }] },
      { type: 'text', text: ' (edited)' },
    ]);
    expect((await db`select 1 from assets where id = ${asset}`).length).toBe(1);

    await page.reload();
    await expect(editor.locator('.unknown-block')).toHaveCount(5);
    await savePage(page, id);
    expect(await storedDoc(id)).toEqual(first);
  });

  test('is deleted on purpose, and Undo before saving brings it back as it was', async ({ page }) => {
    const { id, slug } = await unknownPage(page);
    const before = await storedDoc(id);
    await page.goto(`/${slug}/edit`);
    const editor = page.locator('.ProseMirror');
    const widget = editor.locator('[data-block-id="w-top"]');
    await widget.click();
    await page.getByRole('toolbar', { name: 'Block tools' }).getByRole('button', { name: 'Delete block' }).click();
    await expect(widget).toHaveCount(0);
    await editor.getByText('First paragraph').click();
    await page.keyboard.press('ControlOrMeta+z');
    await expect(widget).toHaveCount(1);
    await savePage(page, id);
    expect(nodesOf(await storedDoc(id), UNKNOWN)).toEqual(nodesOf(before, UNKNOWN));

    await widget.click();
    await page.getByRole('toolbar', { name: 'Block tools' }).getByRole('button', { name: 'Delete block' }).click();
    await savePage(page, id);
    const after = nodesOf(await storedDoc(id), UNKNOWN);
    expect(after.map((n) => n.attrs?.blockId ?? n.type)).not.toContain('w-top');
    expect(after).toHaveLength(4);
  });

  test('is never made by pasting one from elsewhere: what it would hold stays out of the page', async ({ page }) => {
    const { id, slug } = await unknownPage(page);
    await page.goto(`/${slug}/edit`);
    const editor = page.locator('.ProseMirror');
    await expect(editor.locator('.unknown-block')).toHaveCount(5);
    await editor.getByText('First paragraph').click();
    await endOfLine(page, page.locator('.ProseMirror'));
    const smuggled = JSON.stringify({ type: 'paragraph', content: [{ type: 'text', text: 'Smuggled', marks: [{ type: 'link', attrs: { href: 'https://evil.example/' } }] }] });
    await page.evaluate((original) => {
      const data = new DataTransfer();
      const div = document.createElement('div');
      div.setAttribute('data-unknown-block', '');
      div.setAttribute('data-original-type', 'Image');
      div.setAttribute('data-original', original);
      data.setData('text/html', div.outerHTML);
      data.setData('text/plain', '');
      document.querySelector('.ProseMirror')!.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    }, smuggled);
    await expect(editor.locator('.unknown-block')).toHaveCount(5);
    await savePage(page, id);
    expect(JSON.stringify(await storedDoc(id))).not.toContain('Smuggled');
  });
});

/**
 * A text node without text: ProseMirror refuses the whole document over it.
 * Stored directly, as no write path makes one.
 */
async function unreadablePage(page: Page) {
  const { id, slug } = await createPage(page.request, { visibility: null });
  const doc = { type: 'doc', content: [textPara('p-first', 'First paragraph'), { type: 'paragraph', attrs: { blockId: 'p-broken' }, content: [{ type: 'text', text: '' }] }] };
  await db`update pages set doc = ${db.json(JSON.parse(JSON.stringify(doc)))} where id = ${id}`;
  return { id, slug };
}

function watchSaves(page: Page, pageId: string): string[] {
  const saves: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'PUT' && new URL(r.url()).pathname === `/api/pages/${pageId}`) saves.push(r.url());
  });
  return saves;
}

test.describe('a page the editor cannot read', () => {
  test('opens no editor, says so, and keeps the page as it was — for readers too', async ({ page }) => {
    const { id, slug } = await unreadablePage(page);
    const before = await storedDoc(id);
    const saves = watchSaves(page, id);
    await page.goto(`/${slug}/edit`);
    await expect(page.getByRole('alert').filter({ hasText: 'can’t be opened in the editor' })).toBeVisible();
    await expect(page.locator('.ProseMirror')).toHaveCount(0);
    await page.getByRole('button', { name: 'Save', exact: true }).click();

    await page.goto(`/${slug}`);
    await expect(page.getByText('First paragraph')).toBeVisible();
    expect(saves).toEqual([]);
    expect(await storedDoc(id)).toEqual(before);
  });
});

test.describe('unknown blocks on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('are shown in the phone editor and deleted from its toolbar', async ({ page }) => {
    const { id, slug } = await unknownPage(page);
    await page.goto(`/${slug}/edit`);
    const widget = page.locator('.ProseMirror [data-block-id="w-top"]');
    await expect(widget).toContainText('Unknown block: retiredWidget');
    await widget.tap();
    await page.getByRole('button', { name: 'Delete block', exact: true }).tap();
    await expect(widget).toHaveCount(0);
    const saved = page.waitForResponse((r) => r.request().method() === 'PUT' && new URL(r.url()).pathname === `/api/pages/${id}`);
    await page.getByRole('button', { name: 'Save', exact: true }).tap();
    expect((await saved).ok()).toBe(true);
    expect(JSON.stringify(await storedDoc(id))).not.toContain('"w-top"');
  });

  test('a page the phone editor cannot read opens no editor either', async ({ page }) => {
    const { id, slug } = await unreadablePage(page);
    const before = await storedDoc(id);
    await page.goto(`/${slug}/edit`);
    await expect(page.getByRole('alert').filter({ hasText: 'can’t be opened in the editor' })).toBeVisible();
    await expect(page.locator('.ProseMirror')).toHaveCount(0);
    expect(await storedDoc(id)).toEqual(before);
  });
});
