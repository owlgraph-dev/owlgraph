// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// E2E because: the flow is the point. An editor puts a share's folder and one of
// its files on a page; an anonymous reader browses the one and downloads the other.
import type { Locator, Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { test, expect } from '$tests/e2e/fixtures';
import { authState } from '$tests/e2e/seed-data';
import { createPage, formAction, unique } from '$tests/e2e/api';
import { doc, txt } from '$tests/e2e/doc';
import { startMockNextcloud, type MockNextcloud } from './mockNextcloud';
import { blockSettings } from '$tests/e2e/editor';

const API = '/api/plugins/nextcloud';
const PDF = '%PDF-1.4\n% the journey report\n';

let mock: MockNextcloud;
test.beforeAll(async () => {
  mock = await startMockNextcloud();
});
test.afterAll(async () => {
  await mock.close();
});

/** The text of the block the editor's own caret is in (tests/e2e/editor.ts). */
function caretBlock(editor: Locator): Promise<string> {
  return editor.evaluate((el) => {
    type State = { selection: { $from: { parent: { textContent: string } } } };
    return (el as unknown as { editor: { state: State } }).editor.state.selection.$from.parent.textContent;
  });
}

/** Retries the click: the editor settles a click's selection after the mouse events. */
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

const FOLDER_HERE = 'The project folder:';
const FILE_HERE = 'The report itself:';

test.describe('a Nextcloud folder and file on a page', () => {
  // The lock: the integration's settings point at this file's mock (tests/e2e/fixtures.ts).
  test.use({ lock: 'integration-settings', storageState: { cookies: [], origins: [] } });

  test('an editor connects a share from the Insert menu, makes a document of a file, shows the folder and the file on a page, and a reader browses the one and downloads the other', async ({ page: reader, browser }) => {
    test.setTimeout(120_000);
    // Unique names: the editor's pickers list every collection and document, and
    // the listing cache is keyed by the share.
    const share = unique('Projektablage');
    const report = `${unique('Bericht').name}.pdf`;
    const token = `E2eJourney${share.slug.replace(/[^A-Za-z0-9]/g, '')}`;
    const listed = ['Q3', report, 'Notizen.txt'];
    mock.shares.set(token, {
      name: share.name,
      files: {
        [report]: { content: PDF, mime: 'application/pdf', fileid: 731, modified: new Date('2026-10-02T09:30:00Z') },
        'Notizen.txt': { content: 'notes', mime: 'text/plain', fileid: 732 },
        'Q3/Plan.md': { content: '# Plan', mime: 'text/markdown', fileid: 733 },
      },
    });

    const admin = await browser.newContext({ storageState: authState('admin') });
    const configured = await formAction(admin.request, '/settings/integrations/nextcloud?/save', { enabled: 'on', origin: mock.origin, cacheSeconds: '0' });
    expect(configured.type, JSON.stringify(configured)).toBe('success');
    await admin.close();

    const editorContext = await browser.newContext({ storageState: authState('editorA'), viewport: { width: 1280, height: 900 } });
    try {
      // In the public default namespace, as are the collection and document made beside it.
      const { id: pageId, slug } = await createPage(editorContext.request, {
        visibility: null,
        doc: doc(
          { type: 'paragraph', attrs: { blockId: 'folder-here' }, content: [txt(FOLDER_HERE)] },
          { type: 'paragraph', attrs: { blockId: 'file-here' }, content: [txt(FILE_HERE)] }
        ),
      });
      const ed = await editorContext.newPage();
      const canvas = ed.locator('.ProseMirror');
      const panel = blockSettings(ed);
      const folder = canvas.locator('.el');
      const file = canvas.locator('.de');

      await test.step("an editor inserts a folder block from the Insert menu's Collection group and connects a share to it", async () => {
        await ed.goto(`/${slug}/edit`);
        await caretInto(ed, FOLDER_HERE);
        await insert(ed, 'Collection', 'Nextcloud folder');
        await expect(folder).toContainText('Choose a collection in the block settings');
        await folder.locator('.el-placeholder-body').click();
        await panel.getByRole('button', { name: 'New share …' }).click();
        const dialog = ed.getByRole('dialog', { name: 'Connect a share' });
        await dialog.getByRole('textbox', { name: 'Share link' }).fill(`${mock.origin}/s/${token}`);
        const connected = ed.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === `${API}/collections`);
        await dialog.getByRole('button', { name: 'Connect' }).click();
        expect((await connected).status()).toBe(201);
        await expect(dialog).toBeHidden();
        await expect(folder.locator('.el-row .el-name-text')).toHaveText(listed);
      });

      await test.step('they make a document of a file in the listing', async () => {
        const row = folder.getByRole('listitem').filter({ hasText: report });
        const made = ed.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === `${API}/documents`);
        await row.getByRole('button', { name: 'Create as document' }).click();
        expect((await made).status()).toBe(201);
        await expect(row.getByText('Document', { exact: true })).toBeVisible();
        await expect(row.getByRole('link', { name: `Open document ${report}` })).toBeVisible();
      });

      await test.step('they insert a file block from the Document group, show that document in it, and save', async () => {
        await caretInto(ed, FILE_HERE);
        await insert(ed, 'Document', 'Nextcloud file');
        await expect(file).toContainText('Choose a document in the block settings.');
        await file.locator('.de-placeholder-body').click();
        await panel.getByRole('combobox', { name: 'Document', exact: true }).click();
        await ed.getByRole('option', { name: report, exact: true }).click();
        await expect(file.locator('.de-title-text')).toHaveText(report);
        await expect(panel.getByText(new RegExp(`${report.replace(/\./g, '\\.')} · file id 731`))).toBeVisible();

        const saved = ed.waitForResponse((r) => r.request().method() === 'PUT' && new URL(r.url()).pathname === `/api/pages/${pageId}`);
        await ed.getByRole('button', { name: 'Save', exact: true }).click();
        expect((await saved).ok()).toBe(true);
        await expect(ed.getByText(/^Saved /)).toBeVisible();
      });

      await test.step('an anonymous reader sees the listing, its island hydrated: they open a subfolder and come back', async () => {
        await reader.goto(`/${slug}`);
        const listing = reader.locator('.canvas-blocks .el');
        await expect(listing).toHaveAttribute('data-state', 'ready');
        await expect(listing.locator('.el-row .el-name-text')).toHaveText(listed);
        // Only a hydrated island browses: the subfolder is listed in place.
        await listing.locator('.el-row', { hasText: 'Q3' }).getByRole('button').click();
        await expect(listing.getByRole('navigation', { name: 'Folder path' })).toContainText('Q3');
        await expect(listing.locator('.el-row .el-name-text')).toHaveText(['Plan.md']);
        await listing.getByRole('navigation', { name: 'Folder path' }).getByRole('button', { name: share.name }).click();
        await expect(listing.locator('.el-row').first()).toContainText('Q3');
      });

      await test.step('they download the file from its block: the bytes and the name of the file in the share', async () => {
        const block = reader.locator('.canvas-blocks .de');
        await expect(block).toHaveAttribute('data-state', 'ready');
        await expect(block.locator('.de-title-text')).toHaveText(report);
        const [saved] = await Promise.all([reader.waitForEvent('download'), block.getByRole('link', { name: 'Download', exact: true }).click()]);
        expect(saved.suggestedFilename()).toBe(report);
        expect(await readFile((await saved.path())!, 'utf8')).toBe(PDF);
        expect(await reader.content()).not.toContain(token);
      });
    } finally {
      await editorContext.close();
    }
  });
});
