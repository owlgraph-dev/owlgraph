// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Locator, Page } from '@playwright/test';
import { test, expect, waitForHydration } from '../fixtures';
import { authState } from '../seed-data';
import { createPage, unique } from '../api';
import { doc, txt } from '../doc';
import { blockSettings } from '$tests/e2e/editor';

/** The text of the block the editor's own caret is in (tests/e2e/editor.ts). */
function caretBlock(editor: Locator): Promise<string> {
  return editor.evaluate((el) => {
    type State = { selection: { $from: { parent: { textContent: string } } } };
    return (el as unknown as { editor: { state: State } }).editor.state.selection.$from.parent.textContent;
  });
}

/** The caret into the paragraph that reads `text`, once the editor holds it there: it settles a click's selection after the mouse events. */
async function caretInto(page: Page, text: string) {
  const editor = page.locator('.ProseMirror');
  await expect(async () => {
    await editor.getByText(text, { exact: true }).click();
    expect(await caretBlock(editor)).toBe(text);
  }).toPass({ timeout: 10_000 });
}

async function insert(page: Page, group: string, item: string) {
  await page.getByRole('button', { name: 'Insert', exact: true }).click();
  await page.getByRole('group', { name: group }).getByRole('menuitem', { name: item, exact: true }).click();
}

const createDialog = (page: Page) => page.getByRole('dialog', { name: 'Create' });

async function openCreate(page: Page) {
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: 'Create' }).click();
  await expect(createDialog(page)).toBeVisible();
}

const COLLECTION_HERE = 'Our reading list:';
const DOCUMENT_HERE = 'The paper behind it:';

test.describe('collecting and linking', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('an editor collects and labels pages, links a document, embeds both on a page, and a reader opens them through a share link', async ({ page: reader, browser }) => {
    test.setTimeout(120_000);
    const { name: collectionTitle } = unique('Reading list');
    const { name: linkTitle, slug: suffix } = unique('Linked paper');
    const label = unique('Start here').name;
    // A server of the test's own, not a route: Playwright routes only a
    // redirect chain's first request.
    const elsewhere = await serveThePaper();
    const address = `${elsewhere.origin}/${suffix}/paper`;
    const host = new URL(address).host;

    const editorContext = await browser.newContext({ storageState: authState('editorA'), viewport: { width: 1280, height: 900 } });
    try {
      // Two public pages, shown on a restricted page the reader reaches by share link alone.
      const [first, second] = await Promise.all(
        ['Chapter one', 'Chapter two'].map(async (base) => {
          const title = unique(base).name;
          return { ...(await createPage(editorContext.request, { visibility: null, title })), title };
        })
      );
      const hostPage = await createPage(editorContext.request, {
        title: unique('Seminar notes').name,
        doc: doc(
          { type: 'paragraph', attrs: { blockId: 'collection-here' }, content: [txt(COLLECTION_HERE)] },
          { type: 'paragraph', attrs: { blockId: 'document-here' }, content: [txt(DOCUMENT_HERE)] }
        ),
      });
      const ed = await editorContext.newPage();

      await test.step('an editor makes a collection from Create and names it', async () => {
        await openCreate(ed);
        await createDialog(ed).getByRole('button', { name: /^Collection/ }).click();
        await expect(ed).toHaveURL(/\/edit$/);
        await waitForHydration(ed);
        await expect(ed.getByRole('region', { name: 'Contents' })).toContainText('Nothing in this collection yet.');
        await ed.getByRole('button', { name: 'New collection', exact: true }).click();
        await ed.getByLabel('Page title').fill(collectionTitle);
        const renamed = ed.waitForResponse((r) => r.request().method() === 'PATCH' && new URL(r.url()).pathname.startsWith('/api/collections/'));
        await ed.getByLabel('Page title').press('Enter');
        expect((await renamed).ok()).toBe(true);
        await expect(ed.getByRole('button', { name: collectionTitle, exact: true })).toBeVisible();
      });

      await test.step('they add two pages to it and label the first', async () => {
        const section = ed.getByRole('region', { name: 'Contents' });
        for (const member of [first, second]) {
          await section.getByRole('button', { name: 'Add entry' }).click();
          const picker = ed.getByRole('dialog', { name: 'Add to collection' });
          await picker.getByPlaceholder('Search pages, documents and collections').fill(member.title);
          await picker.getByRole('option', { name: new RegExp(`^${member.title}`) }).click();
          await expect(picker).toBeHidden();
          await expect(section.getByText(member.title, { exact: true })).toBeVisible();
        }
        await expect(section).toContainText('2 entries');

        await section.getByRole('button', { name: `Actions for ${first.title}` }).click();
        await ed.getByRole('menuitem', { name: 'Label…' }).click();
        const dialog = ed.getByRole('dialog', { name: 'Label in this collection' });
        await dialog.getByRole('textbox', { name: 'Label English', exact: true }).fill(label);
        await dialog.getByRole('button', { name: 'Save' }).click();
        await expect(dialog).toBeHidden();
        await expect(section.getByText(`Label: ${label}`)).toBeVisible();
      });

      await test.step('they make a link document from Create', async () => {
        await openCreate(ed);
        const dialog = createDialog(ed);
        await dialog.getByRole('button', { name: 'Document' }).click();
        await dialog.getByRole('radio', { name: 'Link', exact: true }).click();
        await dialog.getByLabel('Address', { exact: true }).fill(address);
        await dialog.getByLabel('Title').fill(linkTitle);
        await dialog.getByRole('button', { name: 'Create', exact: true }).click();
        await expect(ed).toHaveURL(/\/edit$/);
        await waitForHydration(ed);
        await expect(ed.getByRole('button', { name: linkTitle, exact: true })).toBeVisible();
        await expect(ed.getByRole('radio', { name: 'Link', exact: true })).toBeChecked();
      });

      await test.step('they embed the collection and the link document on a page and save it', async () => {
        await ed.goto(`/${hostPage.slug}/edit`);
        const canvas = ed.locator('.ProseMirror');
        const panel = blockSettings(ed);

        await caretInto(ed, COLLECTION_HERE);
        await insert(ed, 'Collection', 'Curated collection');
        const collectionBlock = canvas.locator('.collection-block');
        await expect(collectionBlock).toContainText('Choose a collection in the block settings.');
        await panel.getByRole('button', { name: 'Choose…' }).click();
        const collectionPicker = ed.getByRole('dialog', { name: 'Choose a collection' });
        await collectionPicker.getByPlaceholder('Search collections').fill(collectionTitle);
        await collectionPicker.getByRole('option', { name: new RegExp(collectionTitle) }).click();
        await expect(collectionPicker).toBeHidden();
        await expect(collectionBlock.locator('.el-row .el-name-text')).toHaveText([label, second.title]);

        await caretInto(ed, DOCUMENT_HERE);
        await insert(ed, 'Document', 'File or link');
        const documentBlock = canvas.locator('.document-block');
        await expect(documentBlock).toContainText('Choose a document in the block settings.');
        await panel.getByRole('button', { name: 'Choose…' }).click();
        const documentPicker = ed.getByRole('dialog', { name: 'Choose a document' });
        await documentPicker.getByPlaceholder('Search documents').fill(linkTitle);
        await documentPicker.getByRole('option', { name: new RegExp(linkTitle) }).click();
        await expect(documentPicker).toBeHidden();
        await expect(documentBlock.locator('.de-title-text')).toHaveText(linkTitle);

        const saved = ed.waitForResponse((r) => r.request().method() === 'PUT' && new URL(r.url()).pathname === `/api/pages/${hostPage.id}`);
        await ed.getByRole('button', { name: 'Save', exact: true }).click();
        expect((await saved).ok()).toBe(true);
        await expect(ed.getByText(/^Saved /)).toBeVisible();
      });

      let shareUrl = '';
      await test.step('they make a share link for the page', async () => {
        await ed.getByRole('button', { name: 'Access control' }).click();
        const made = ed.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === `/api/pages/${hostPage.id}/share-links`);
        await ed.getByRole('button', { name: 'Create link', exact: true }).click();
        expect((await made).ok()).toBe(true);
        shareUrl = await ed.getByRole('textbox', { name: 'Share links', exact: true }).inputValue();
        expect(shareUrl).toMatch(/\/share\/[^/]+$/);
      });

      await test.step('an anonymous reader opens the page through the share link and sees both', async () => {
        await reader.goto(new URL(shareUrl).pathname);
        const collection = reader.locator('.collection-block');
        await expect(collection.locator('.el-row .el-name-text')).toHaveText([label, second.title]);
        // The label stands in for the title, which stays beside it.
        await expect(collection.locator('.el-row').first().locator('.el-note')).toHaveText(first.title);
        const paper = reader.locator('.document-block');
        await expect(paper.locator('.de-title-text')).toHaveText(linkTitle);
        await expect(paper).toContainText(host);
      });

      await test.step('they follow the link document out through its redirect', async () => {
        // Made, embedded and shown, the address was never asked for: the app never fetches it.
        expect(elsewhere.requests).toEqual([]);
        // The entry opens a tab of its own, at the document's content address.
        const opened = reader.context().waitForEvent('page');
        await reader.locator('.document-block a.de-entry').click();
        const paper = await opened;
        await paper.waitForURL(address);
        await expect(paper.getByRole('heading', { name: 'The paper itself' })).toBeVisible();
        expect(elsewhere.requests[0]).toBe(`/${suffix}/paper`);
        await paper.close();
      });
    } finally {
      await editorContext.close();
      await elsewhere.close();
    }
  });
});

/** A page of the test's own on 127.0.0.1, standing in for the place a link document points to; it records what it was asked for. */
async function serveThePaper(): Promise<{ origin: string; requests: string[]; close: () => Promise<void> }> {
  const requests: string[] = [];
  const server = createServer((req, res) => {
    requests.push(req.url ?? '');
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end('<!doctype html><title>The paper</title><h1>The paper itself</h1>');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return { origin: `http://127.0.0.1:${port}`, requests, close: () => new Promise((resolve) => server.close(() => resolve())) };
}
