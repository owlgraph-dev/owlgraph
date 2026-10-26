// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// E2E because: a reader is asked to connect and brought back to the page, each
// island drawing their own listing; an editor chooses from their own Nextcloud.
import type { APIRequestContext, Browser, BrowserContext, Page } from '@playwright/test';
import { test, expect } from '$tests/e2e/fixtures';
import { createPage, throwawayUserState } from '$tests/e2e/api';
import { doc, txt } from '$tests/e2e/doc';
import { horizontalOverflow, touchTargets } from '$tests/e2e/responsive';
import { authState } from '$tests/e2e/seed-data';
import { db } from '$lib/platform/db.server';
import { startMockNextcloud, type MockNextcloud, type MockUser } from './mockNextcloud';
import { anonymous } from '$tests/e2e/fixtures';
import { configure } from './settings';
import { blockSettings } from '$tests/e2e/editor';

const API = '/api/plugins/nextcloud';

const team = { a: { content: 'A from the team', mime: 'text/plain', fileid: 501 }, b: { content: 'B', mime: 'text/plain', fileid: 502 }, secret: { content: 'S', mime: 'text/plain', fileid: 503 } };
// A file per test that makes a document of it: one document per file in a namespace, and every
// test's pages share the default one (private.http.test.ts uses 510).
const pdf = (fileid: number) => ({ content: `%PDF-1.4 ${fileid}`, mime: 'application/pdf', fileid });
const RECHNUNG = pdf(511);
const VERTRAG = pdf(512);
const NOTIZ = pdf(513);

// Alice owns Projekte/Team (500); Carol has it and two of Alice's files shared, without geheim.txt.
const users = (): Record<string, MockUser> => ({
  alice: {
    loginName: 'alice@example.com',
    displayName: 'Alice Example',
    tree: {
      name: '',
      files: { 'Projekte/Team/a.txt': team.a, 'Projekte/Team/b.txt': team.b, 'Projekte/Team/geheim.txt': team.secret, 'Privat/Rechnung.pdf': RECHNUNG, 'Privat/Vertrag.pdf': VERTRAG, 'Privat/Notiz.pdf': NOTIZ },
      folderIds: { 'Projekte/Team': 500 },
    },
  },
  carol: {
    loginName: 'carol',
    displayName: 'Carol Example',
    tree: { name: '', files: { 'Team/a.txt': team.a, 'Team/b.txt': team.b, 'Team/geheim.txt': team.secret, 'Steuer/Rechnung.pdf': RECHNUNG, 'Steuer/Vertrag.pdf': VERTRAG }, folderIds: { Team: 500 } },
    hidden: ['Team/geheim.txt'],
  },
});

let mock: MockNextcloud;
test.beforeAll(async () => {
  mock = await startMockNextcloud({}, users());
});
test.afterAll(async () => {
  await mock.close();
});
test.beforeEach(() => {
  mock.mode = 'ok';
  mock.flowServer = null;
  mock.requests.length = 0;
  mock.users.clear();
  for (const [uid, user] of Object.entries(users())) mock.users.set(uid, user);
});

test.use({ lock: 'integration-settings', storageState: authState('admin') });

interface Person {
  userId: string;
  context: BrowserContext;
  page: Page;
  request: APIRequestContext;
}

async function person(browser: Browser, viewport?: { width: number; height: number }): Promise<Person> {
  const { userId, storageState } = await throwawayUserState('editor');
  const context = await browser.newContext({ storageState, ...(viewport ? { viewport, hasTouch: true, isMobile: true } : {}) });
  const page = await context.newPage();
  return { userId, context, page, request: context.request };
}

const pollState = async (request: APIRequestContext) => ((await (await request.post('/api/connections/nextcloud/poll', { data: {} })).json()) as { state: string }).state;

async function connectAs(who: Person, uid: string): Promise<void> {
  const begun = await who.request.post('/api/connections/nextcloud', { data: {} });
  expect(begun.status(), await begun.text()).toBe(200);
  const { approveUrl } = (await begun.json()) as { approveUrl: string };
  expect(mock.approve(approveUrl.split('/').at(-1)!, uid)).toBeTruthy();
  await expect.poll(() => pollState(who.request), { intervals: [3200], timeout: 20_000 }).toBe('connected');
}

/** Beside a page of the owner's that anyone may read. */
async function ownCollection(owner: Person): Promise<{ id: string; pageId: string }> {
  const anchor = await createPage(owner.request, { visibility: null });
  const res = await owner.request.post(`${API}/collections`, { data: { pageId: anchor.id, own: { path: 'Projekte/Team', fileid: '500' } } });
  expect(res.status(), await res.text()).toBe(201);
  return { id: ((await res.json()) as { collection: { id: string } }).collection.id, pageId: anchor.id };
}

const folderNode = (collectionId: string) => ({ type: 'nextcloudFolder', attrs: { blockId: 'folder-1', collectionId, startPath: '' } });
const fileNode = (documentId: string) => ({ type: 'nextcloudFile', attrs: { blockId: 'file-1', documentId } });
const publicPage = (request: APIRequestContext, ...blocks: unknown[]) => createPage(request, { visibility: null, doc: doc({ type: 'paragraph', content: [txt('Above.')] }, ...blocks) });

const rows = (page: Page) => page.locator('.el .el-row .el-name-text');

test.describe('a folder read from each viewer’s own files', () => {
  test('asks a reader to connect, brings them back to the page, and shows each their own — anyone else a neutral placeholder', async ({ page, browser }) => {
    await configure(page.request, mock.origin);
    const alice = await person(browser);
    await connectAs(alice, 'alice');
    const collection = await ownCollection(alice);
    const { slug } = await publicPage(alice.request, folderNode(collection.id));

    await alice.page.goto(`/${slug}`);
    await expect(rows(alice.page)).toHaveText(['a.txt', 'b.txt', 'geheim.txt']);

    const visitor = await anonymous(browser);
    const seen = await visitor.newPage();
    await seen.goto(`/${slug}`);
    await expect(seen.locator('.el')).toContainText('Folder currently unavailable');
    expect(await seen.content()).not.toContain('geheim.txt');
    await visitor.close();

    // Signed in, not connected.
    const carol = await person(browser);
    await carol.page.goto(`/${slug}`);
    const block = carol.page.locator('.el');
    await expect(block).toContainText('Connect your Nextcloud to see this folder');
    const connect = block.getByRole('link', { name: 'Connect Nextcloud' });
    await expect(connect).toHaveAttribute('href', `/settings/connections?return=${encodeURIComponent(`/${slug}`)}`);
    await connect.click();
    await expect(carol.page).toHaveURL(/\/settings\/connections\?return=/);
    const row = carol.page.getByRole('group', { name: 'Nextcloud' });
    const [approval] = await Promise.all([carol.context.waitForEvent('page'), row.getByRole('button', { name: 'Connect Nextcloud' }).click()]);
    await approval.getByRole('button', { name: 'Zugriff gewähren als Carol Example' }).click();
    await expect(row).toContainText('Connected as Carol Example', { timeout: 20_000 });
    await carol.page.getByRole('link', { name: 'Back to the page' }).click();
    await expect(carol.page).toHaveURL(new RegExp(`/${slug}$`));
    // What Nextcloud lets her see of it.
    await expect(rows(carol.page)).toHaveText(['a.txt', 'b.txt']);
    for (const p of [alice, carol]) await p.context.close();
  });
});

test.describe('the editor choosing from their own Nextcloud', () => {
  test('makes a folder block list a folder of theirs, and a file block show a file of theirs — once per file', async ({ page, browser }) => {
    await configure(page.request, mock.origin);
    const alice = await person(browser);
    await connectAs(alice, 'alice');
    const { slug } = await createPage(alice.request, { visibility: null });
    const editor = alice.page;
    await editor.goto(`/${slug}/edit`);
    const panel = blockSettings(editor);

    await editor.locator('.ProseMirror').click();
    await editor.getByRole('button', { name: 'Insert', exact: true }).click();
    await editor.getByRole('group', { name: 'Collection' }).getByRole('menuitem', { name: 'Nextcloud folder' }).click();
    const folder = editor.locator('.ProseMirror .el');
    await folder.locator('.el-placeholder-body').click();
    await panel.getByRole('button', { name: 'Choose from my Nextcloud …' }).click();
    const folders = editor.getByRole('dialog', { name: 'Choose a folder of your Nextcloud' });
    await folders.getByRole('button', { name: 'Projekte' }).click();
    await folders.getByRole('button', { name: 'Team' }).click();
    await folders.getByRole('button', { name: 'Choose this folder' }).click();
    await expect(folders).toBeHidden();
    await expect(folder.locator('.el-row .el-name-text')).toHaveText(['a.txt', 'b.txt', 'geheim.txt']);

    const { slug: second } = await createPage(alice.request, { visibility: null });
    const editor2 = await alice.context.newPage();
    await editor2.goto(`/${second}/edit`);
    await editor2.locator('.ProseMirror').click();
    await editor2.getByRole('button', { name: 'Insert', exact: true }).click();
    await editor2.getByRole('group', { name: 'Document' }).getByRole('menuitem', { name: 'Nextcloud file' }).click();
    const file = editor2.locator('.ProseMirror .de');
    await file.locator('.de-placeholder-body').click();
    const panel2 = blockSettings(editor2);
    // Picked twice: the same file, the same document.
    for (let i = 0; i < 2; i++) {
      await panel2.getByRole('button', { name: 'Choose from my Nextcloud …' }).click();
      const files = editor2.getByRole('dialog', { name: 'Choose a file of your Nextcloud' });
      await files.getByRole('button', { name: 'Privat' }).click();
      await files.getByRole('button', { name: 'Notiz.pdf' }).click();
      await files.getByRole('button', { name: 'Choose', exact: true }).click();
      await expect(files).toBeHidden();
      await expect(file.locator('.de-title-text')).toHaveText('Notiz.pdf');
    }
    const made = await db<{ id: string }[]>`select id from documents where plugin = 'nextcloud' and source_ref->>'fileid' = '513'`;
    expect(made).toHaveLength(1);
    await alice.context.close();
  });
});

test.describe('the placeholders on a phone', () => {
  test('fit a phone, and a finger can follow them', async ({ page, browser }) => {
    await configure(page.request, mock.origin);
    const alice = await person(browser);
    await connectAs(alice, 'alice');
    const collection = await ownCollection(alice);
    const anchor = await createPage(alice.request, { visibility: null });
    const made = await alice.request.post(`${API}/documents`, { data: { besidePageId: anchor.id, own: { path: 'Privat/Vertrag.pdf', fileid: '512' } } });
    expect(made.status(), await made.text()).toBe(201);
    const { document } = (await made.json()) as { document: { id: string } };
    const { slug } = await publicPage(alice.request, folderNode(collection.id), fileNode(document.id));

    const carol = await person(browser, { width: 390, height: 844 });
    await carol.page.goto(`/${slug}`);
    await expect(carol.page.locator('.el')).toContainText('Connect your Nextcloud to see this folder');
    await expect(carol.page.locator('.de')).toContainText('Connect your Nextcloud to open this file');
    expect(await horizontalOverflow(carol.page)).toEqual([]);
    expect(await touchTargets(carol.page, '.el')).toEqual([]);
    expect(await touchTargets(carol.page, '.de')).toEqual([]);
    for (const p of [alice, carol]) await p.context.close();
  });
});
