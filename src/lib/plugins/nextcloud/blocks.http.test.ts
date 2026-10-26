// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { unflatten } from 'devalue';
import { createSession, createUser } from '$lib/features/auth/server';
import { getGraph } from '$lib/features/graph/server';
import { wrapUnknown, type JsonNode } from '$lib/features/content';
import { call, createPage, formAction, startApp, type ServedApp } from '$tests/integration/http';
import { userOf, type Role } from '$tests/integration/users';
import { startMockNextcloud, type MockShare, type MockUser } from './e2e/mockNextcloud';

// The plugin's blocks and collection pages as served, against the mock
// (docs/architecture/nextcloud.md). The HTML is read without running
// its islands: a listing is held once the route the island asks has answered.

const app = await startApp();
const API = '/api/plugins/nextcloud';
const PDF = '%PDF-1.4\n% http\n';
const ROOT = 530;
const TEAM = {
  'a.txt': { content: 'A', mime: 'text/plain', fileid: 531 },
  'b.txt': { content: 'B', mime: 'text/plain', fileid: 532 },
  'Bericht.pdf': { content: '%PDF-1.4 533', mime: 'application/pdf', fileid: 533 },
};

// Alice holds the team folder the collection pages' shares are of.
const users: Record<string, MockUser> = {
  alice: {
    loginName: 'alice@example.com',
    displayName: 'Alice Example',
    tree: { name: '', files: Object.fromEntries(Object.entries(TEAM).map(([name, file]) => [`Projekte/Team/${name}`, file])), folderIds: { 'Projekte/Team': ROOT } },
  },
};
const mock = await startMockNextcloud({}, users);

afterAll(async () => {
  await mock.close();
  if (!app.skipped) await app.close();
});

const folderShare = (): MockShare => ({
  name: 'Projektunterlagen',
  files: {
    'Bericht.pdf': { content: PDF, mime: 'application/pdf', fileid: 301, modified: new Date('2026-10-02T09:30:00Z') },
    'Notizen.txt': { content: 'notes', mime: 'text/plain', fileid: 302, modified: new Date('2026-10-05T09:30:00Z') },
    'Zahlen.csv': { content: 'a,b\n1,2\n'.repeat(300), mime: 'text/csv', fileid: 303, modified: new Date('2026-09-20T09:30:00Z') },
    'Q3/Plan.md': { content: '# Plan', mime: 'text/markdown', fileid: 304 },
    'Q3/Archiv/alt.txt': { content: 'old', mime: 'text/plain', fileid: 305 },
  },
  folders: ['Leer'],
});

let shares = 0;
const fileShare = (): MockShare => ({
  name: `Akten ${++shares}`,
  files: {
    'Bericht.pdf': { content: PDF, mime: 'application/pdf', fileid: 401, modified: new Date('2026-10-02T09:30:00Z') },
    'Notizen.txt': { content: 'notes', mime: 'text/plain', fileid: 403 },
    'Q3/Protokoll.md': { content: '# Protokoll', mime: 'text/markdown', fileid: 404 },
  },
});
const teamShare = (): MockShare => ({ name: 'Team', files: TEAM, folderIds: { '': ROOT } });

describe.skipIf(app.skipped)('the Nextcloud plugin, served', () => {
  const served = app as ServedApp;

  beforeEach(() => {
    mock.mode = 'ok';
    mock.requests.length = 0;
  });

  /** Through the settings form, which refreshes the served build's cache. */
  async function configure(enabled = true) {
    const result = await formAction(served, '/settings/integrations/nextcloud?/save', { ...(enabled ? { enabled: 'on' } : {}), origin: mock.origin, cacheSeconds: '0' }, { as: 'admin' });
    expect(result.type, JSON.stringify(result.data)).toBe('success');
  }

  /** The collection and its anchor page both inherit the public default namespace. */
  async function connect(share: MockShare) {
    const token = `HttpShare${++shares}`;
    mock.shares.set(token, share);
    const anchor = await createPage(served, 'admin');
    const res = await call(served, `${API}/collections`, { as: 'admin', json: { pageId: anchor.id, shareUrl: `${mock.origin}/s/${token}` } });
    expect(res.status, await res.clone().text()).toBe(201);
    const { collection } = (await res.json()) as { collection: { id: string; href: string; title: string } };
    return { ...collection, token };
  }

  async function makeDocument(collectionId: string, path: string, fileid: string) {
    const res = await call(served, `${API}/documents`, { as: 'admin', json: { collectionId, path, fileid } });
    expect(res.status, await res.clone().text()).toBe(201);
    return ((await res.json()) as { document: { id: string; title: string; href: string } }).document;
  }

  /** As a page's island asks; holds the listing for the server's next render. */
  async function list(collectionId: string, path = '', who: { as?: Role; cookie?: string } = {}) {
    const res = await call(served, `${API}/listing?${new URLSearchParams({ c: collectionId, p: path })}`, who);
    expect(res.status).toBe(200);
    return (await res.json()) as { state: string; via: string | null; entries: { name: string }[] };
  }

  const txt = (text: string) => ({ type: 'text', text });
  const doc = (...content: unknown[]) => ({ type: 'doc', content: [{ type: 'paragraph', content: [txt('Above the blocks.')] }, ...content] });
  const folderNode = (collectionId: string, attrs: Record<string, unknown> = {}) => ({ type: 'nextcloudFolder', attrs: { blockId: 'folder-1', collectionId, startPath: '', ...attrs } });
  const fileNode = (documentId: string, attrs: Record<string, unknown> = {}) => ({ type: 'nextcloudFile', attrs: { blockId: 'file-1', documentId, ...attrs } });

  const dom = async (path: string, who: { as?: Role; cookie?: string } = {}) => new JSDOM(await (await call(served, path, who)).text()).window.document;
  const textOf = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const rowNames = (scope: ParentNode) => [...scope.querySelectorAll('.el-row .el-name-text')].map(textOf);
  /** As getByText(…, { exact: true }) finds it. */
  const exactly = (scope: ParentNode, text: string) => [...scope.querySelectorAll('*')].find((el) => textOf(el) === text && [...el.children].every((c) => textOf(c) !== text)) ?? null;
  const linkNamed = (scope: ParentNode, name: string) => [...scope.querySelectorAll('a')].find((a) => textOf(a).startsWith(name) || a.getAttribute('aria-label') === name) ?? null;

  let people = 0;
  async function person() {
    const user = await createUser({ email: `nextcloud-reader-${++people}@http.test`, name: `Reader ${people}`, password: 'a long enough password 42', role: 'editor' });
    return { id: user.id, cookie: `session=${(await createSession(user.id)).token}` };
  }

  describe('the Nextcloud folder block', () => {
    it('is read through a share link of its page, as an anonymous reader would', async () => {
      await configure();
      const collection = await connect(folderShare());
      const { id } = await createPage(served, 'admin', { doc: doc(folderNode(collection.id)) });
      const created = await call(served, `/api/pages/${id}/share-links`, { as: 'admin', json: { label: 'http' } });
      expect(created.ok).toBe(true);
      const { token } = (await created.json()) as { token: string };

      // Nothing held yet: the skeleton, which the island fills.
      const cold = await dom(`/share/${token}`);
      expect(cold.querySelector('.el')?.getAttribute('data-state')).toBe('loading');
      expect((await list(collection.id)).state).toBe('ready');

      // Held: the server's HTML lists the share, with no style attribute in the content.
      const held = await dom(`/share/${token}`);
      expect(held.querySelector('.el')?.getAttribute('data-state')).toBe('ready');
      expect(rowNames(held)).toContain('Bericht.pdf');
      expect(held.querySelectorAll('.canvas-blocks [style]')).toHaveLength(0);
    });

    it('keeps what readers may not see: a restricted collection is a neutral placeholder on a public page, a restricted page and its listing are 404', async () => {
      await configure();
      const hidden = await connect(folderShare());
      expect((await call(served, `/api/collections/${hidden.id}`, { as: 'admin', method: 'PATCH', json: { visibility: 'restricted' } })).ok).toBe(true);
      const { slug } = await createPage(served, 'admin', { doc: doc(folderNode(hidden.id, { startPath: 'Q3/Archiv' })) });
      const res = await call(served, `/${slug}`);
      expect(res.status).toBe(200);
      const html = await res.text();
      const block = new JSDOM(html).window.document.querySelector('.el');
      expect(block?.getAttribute('data-state')).toBe('unavailable');
      expect(textOf(block)).toContain('Folder currently unavailable');
      // Nothing of the share or of the block's settings.
      for (const hiddenText of ['Bericht.pdf', 'Q3/Archiv', 'Archiv', hidden.id]) expect(html).not.toContain(hiddenText);

      const visible = await connect(folderShare());
      const restricted = await createPage(served, 'admin', { doc: doc(folderNode(visible.id)), visibility: 'restricted' });
      expect((await call(served, `/${restricted.slug}`)).status).toBe(404);
      expect((await call(served, `/api/collections/${visible.id}`, { as: 'admin', method: 'PATCH', json: { visibility: 'restricted' } })).ok).toBe(true);
      expect((await call(served, `${API}/listing?c=${visible.id}`)).status).toBe(404);
    });
  });

  describe('the Nextcloud file block', () => {
    it('keeps what readers may not see: a restricted document is a neutral placeholder, and its content a 404', async () => {
      await configure();
      const collection = await connect(fileShare());
      const hidden = await makeDocument(collection.id, 'Notizen.txt', '403');
      expect((await call(served, `/api/documents/${hidden.id}`, { as: 'admin', method: 'PATCH', json: { visibility: 'restricted' } })).ok).toBe(true);
      const { slug } = await createPage(served, 'admin', { doc: doc(fileNode(hidden.id)) });

      const html = await (await call(served, `/${slug}`)).text();
      const block = new JSDOM(html).window.document.querySelector('.de');
      expect(block?.getAttribute('data-state')).toBe('unavailable');
      expect(textOf(block)).toContain('Currently unavailable');
      expect(html).not.toContain('Notizen.txt');
      expect((await call(served, `/api/documents/${hidden.id}/content`)).status).toBe(404);

      // Its writer still reads it.
      expect((await dom(`/${slug}`, { as: 'admin' })).querySelector('.de')?.getAttribute('data-state')).toBe('ready');
    });

    it('binds its document to another file of the share once its own is gone — the same node, its edges kept', async () => {
      await configure();
      const collection = await connect(fileShare());
      const document = await makeDocument(collection.id, 'Notizen.txt', '403');
      const { id: pageId } = await createPage(served, 'admin', { doc: doc(fileNode(document.id)) });
      const admin = await userOf('admin');
      const edges = async () => {
        const graph = await getGraph(admin);
        return {
          shownBy: graph.edges.some((e) => e.source === pageId && e.target === document.id),
          contained: graph.edges.some((e) => e.source === collection.id && e.target === document.id && e.relationshipType === 'contains'),
        };
      };
      expect(await edges()).toEqual({ shownBy: true, contained: true });

      // Gone from the share: the editor's check says so.
      delete mock.shares.get(collection.token)!.files['Notizen.txt'];
      const checked = await call(served, `${API}/documents/${document.id}/check`, { as: 'admin', json: {} });
      expect(checked.status).toBe(200);
      expect(((await checked.json()) as { document: { status: string } }).document.status).toBe('notFound');

      const rebound = await call(served, `${API}/documents/${document.id}`, { as: 'admin', method: 'PATCH', json: { path: 'Q3/Protokoll.md', fileid: '404' } });
      expect(rebound.status, await rebound.clone().text()).toBe(200);
      const got = (await (await call(served, `${API}/documents/${document.id}`, { as: 'admin' })).json()) as { document: Record<string, unknown> };
      expect(got.document).toMatchObject({ id: document.id, path: 'Q3/Protokoll.md', fileid: '404', status: 'ok' });
      expect(await edges()).toEqual({ shownBy: true, contained: true });
    });
  });

  describe("a Nextcloud collection's own page", () => {
    const header = (page: Document) => page.querySelector('header.node-head')!;
    const tabNamed = (page: Document, name: string) => [...page.querySelectorAll('[role="tab"]')].find((tab) => textOf(tab) === name) ?? null;
    /** A tab and its panel carry one `data-value`. */
    const panelOf = (page: Document, name: string) => {
      const value = tabNamed(page, name)?.getAttribute('data-value');
      return value ? page.querySelector(`[role="tabpanel"][data-value="${value}"]`) : null;
    };
    const contents = (page: Document) => panelOf(page, 'Contents')!;
    const provenance = (page: Document) => textOf(contents(page).querySelector('.el-provenance'));

    it("shows anyone its header and the folder through its share — never the share's address", async () => {
      await configure();
      const collection = await connect(teamShare());
      const never = [collection.token, '/s/', 'public.php'];

      const first = await call(served, collection.href);
      expect(first.status).toBe(200);
      const firstHtml = await first.text();
      for (const text of never) expect(firstHtml).not.toContain(text);

      const listing = await call(served, `${API}/listing?c=${collection.id}&p=`);
      const listingText = await listing.text();
      for (const text of never) expect(listingText).not.toContain(text);
      const listed = JSON.parse(listingText) as { state: string; via: string; entries: { name: string }[] };
      expect(listed).toMatchObject({ state: 'ready', via: 'node' });
      expect(listed.entries.map((e) => e.name)).toEqual(['a.txt', 'b.txt', 'Bericht.pdf']);

      const res = await call(served, collection.href);
      const html = await res.text();
      for (const text of never) expect(html).not.toContain(text);
      const page = new JSDOM(html).window.document;
      const head = header(page);
      expect(textOf(head.querySelector('h1'))).toBe(collection.title);
      expect(textOf(head.querySelector('nav[aria-label="Location"]'))).toContain(collection.title);
      // Connected through its share, which told it its folder's id: readable both ways.
      expect(exactly(head, 'Nextcloud · Share + own files')).not.toBeNull();
      expect(exactly(head, 'Public')).not.toBeNull();
      expect(linkNamed(head, 'Open in Nextcloud')).toBeNull();

      expect(tabNamed(page, 'Contents')?.getAttribute('aria-selected')).toBe('true');
      expect(rowNames(contents(page))).toEqual(['a.txt', 'b.txt', 'Bericht.pdf']);
      expect(provenance(page)).toContain('Nextcloud, via share');
      expect(textOf(panelOf(page, 'Linked documents (0)'))).toContain('No linked documents yet.');
    });

    it('reads a connected reader’s own files as them, says so, and offers the folder in Nextcloud', async () => {
      await configure();
      const collection = await connect(teamShare());
      // Read once through the share, which tells the collection its folder's id.
      await list(collection.id, '', { as: 'admin' });

      const alice = await person();
      const begun = await call(served, '/api/connections/nextcloud', { cookie: alice.cookie, json: {} });
      expect(begun.status, await begun.clone().text()).toBe(200);
      const { approveUrl } = (await begun.json()) as { approveUrl: string };
      expect(mock.approve(approveUrl.split('/').at(-1)!, 'alice')).toBeTruthy();
      const polled = await call(served, '/api/connections/nextcloud/poll', { cookie: alice.cookie, json: {} });
      expect(((await polled.json()) as { state: string }).state).toBe('connected');
      mock.requests.length = 0;

      // Read as her, in her own files; the share is not asked.
      const hers = await list(collection.id, '', { cookie: alice.cookie });
      expect(hers).toMatchObject({ state: 'ready', via: 'user' });
      expect(hers.entries.map((e) => e.name)).toEqual(['a.txt', 'b.txt', 'Bericht.pdf']);
      const asHer = mock.requests.filter((r) => r.authUser === 'alice');
      expect(asHer.length).toBeGreaterThan(0);
      expect(asHer.every((r) => r.path.startsWith('/remote.php/'))).toBe(true);

      const page = await dom(collection.href, { cookie: alice.cookie });
      const head = header(page);
      expect(exactly(head, 'Nextcloud · Share + own files')).not.toBeNull();
      const open = linkNamed(head, 'Open in Nextcloud');
      expect(open?.getAttribute('href')).toBe(`${mock.origin}/index.php/f/${ROOT}`);
      expect(open?.getAttribute('target')).toBe('_blank');
      expect(provenance(page)).toContain('Nextcloud, read as Alice Example');
      expect(rowNames(contents(page))).toEqual(['a.txt', 'b.txt', 'Bericht.pdf']);

      const other = await dom(collection.href, { as: 'admin' });
      expect(provenance(other)).toContain('Nextcloud, via share');
      expect(linkNamed(header(other), 'Open in Nextcloud')).toBeNull();
    });

    it('shows a restricted collection to nobody else, and nothing of its folder', async () => {
      await configure();
      const collection = await connect(teamShare());
      expect((await call(served, `/api/collections/${collection.id}`, { as: 'admin', method: 'PATCH', json: { visibility: 'restricted' } })).ok).toBe(true);
      expect((await list(collection.id, '', { as: 'admin' })).state).toBe('ready');
      expect(rowNames(contents(await dom(collection.href, { as: 'admin' })))).toEqual(['a.txt', 'b.txt', 'Bericht.pdf']);

      const other = await person();
      const refused = await call(served, collection.href, { cookie: other.cookie });
      expect(refused.status).toBe(404);
      expect(await refused.text()).not.toContain('Bericht.pdf');
      expect((await call(served, `${API}/listing?c=${collection.id}&p=`, { cookie: other.cookie })).status).toBe(404);
      expect((await call(served, collection.href)).status).toBe(404);
    });

    it('shows its members alone while the integration is off', async () => {
      await configure();
      const collection = await connect(teamShare());
      await configure(false);
      try {
        const page = await dom(collection.href, { as: 'admin' });
        expect(exactly(header(page), 'Nextcloud')).not.toBeNull();
        expect(page.querySelector('[role="tablist"]')).toBeNull();
        expect(textOf(page.querySelector('main'))).toContain('Nothing in this collection yet.');
      } finally {
        await configure();
      }
    });
  });

  describe('the Nextcloud blocks while the plugin is turned off', () => {
    /** The editor's server load, as client navigation reads it. */
    async function editorData(slug: string) {
      const res = await call(served, `/${slug}/edit/__data.json`, { as: 'admin' });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { type: string; nodes: ({ type: string; data: unknown } | null)[] };
      const nodes = body.nodes.filter((n) => n?.type === 'data').map((n) => unflatten(n!.data as number | unknown[]) as Record<string, unknown>);
      return nodes.find((n) => n.kind === 'page') as { page: { doc: { content: { type: string; attrs?: Record<string, unknown> }[] } }; enabledPlugins: string[] };
    }

    async function pageWhileOff() {
      await configure();
      const collection = await connect(folderShare());
      const document = await makeDocument(collection.id, 'Notizen.txt', '302');
      const { slug } = await createPage(served, 'admin', { doc: doc(folderNode(collection.id), fileNode(document.id)) });
      await configure(false);
      mock.requests.length = 0;
      return { collection, document, slug };
    }

    it('renders a page holding its folder and file blocks — the folder its neutral placeholder — opens both in its editor as known blocks, and asks Nextcloud nothing', async () => {
      const { collection, document, slug } = await pageWhileOff();
      try {
        for (const who of [{}, { as: 'admin' as const }]) {
          const res = await call(served, `/${slug}`, who);
          expect(res.status).toBe(200);
          const page = new JSDOM(await res.text()).window.document;
          const folder = page.querySelector('.el');
          expect(folder?.getAttribute('data-state')).toBe('unavailable');
          expect(textOf(folder)).toContain('Folder currently unavailable');
          expect(rowNames(page)).toEqual([]);
          expect(page.querySelector('.de')).not.toBeNull();
        }

        // Handed both blocks as their own kinds: the editor's load (wrapUnknown) wraps neither as unknown.
        expect((await call(served, `/${slug}/edit`, { as: 'admin' })).status).toBe(200);
        const data = await editorData(slug);
        expect(data.enabledPlugins).toEqual([]);
        const loaded = wrapUnknown(data.page.doc as JsonNode) as typeof data.page.doc;
        expect(loaded.content.map((n) => n.type)).toEqual(['paragraph', 'nextcloudFolder', 'nextcloudFile']);
        expect(loaded.content[1].attrs).toMatchObject({ collectionId: collection.id });
        expect(loaded.content[2].attrs).toMatchObject({ documentId: document.id });

        expect(mock.requests).toEqual([]);
      } finally {
        await configure();
      }
    });

    it('renders the file block too as its neutral placeholder while the plugin is off — nothing of its file', async () => {
      const { document, slug } = await pageWhileOff();
      try {
        for (const who of [{}, { as: 'admin' as const }]) {
          const page = new JSDOM(await (await call(served, `/${slug}`, who)).text()).window.document;
          const file = page.querySelector('.de');
          expect(file?.getAttribute('data-state')).toBe('unavailable');
          expect(textOf(file)).toContain('Currently unavailable');
          for (const text of ['Notizen.txt', 'Projektunterlagen', `/api/documents/${document.id}/content`]) expect(file?.outerHTML).not.toContain(text);
        }
        expect(mock.requests).toEqual([]);
      } finally {
        await configure();
      }
    });
  });
});
