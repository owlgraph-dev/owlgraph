// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { GRANT_TTL_MS } from '$lib/features/pluginHost/server';
import { call, createPage, formAction, startApp, type CallOptions, type ServedApp } from '$tests/integration/http';
import { connectAs } from '$tests/integration/mcp';
import { startMockNextcloud, type MockNextcloud, type MockShare } from './e2e/mockNextcloud';

// What the integration passes on from a share, as served, against the mock
// (docs/architecture/plugins.md, "Grants"). Settings go through the form: the served build
// caches them, and only its own save refreshes them.

const app = await startApp();

const OPEN = 'HttpOpenShare1';
// Its own share: listings are cached per share, and another test's would answer without asking.
const REFUSED = 'HttpRefusedShare3';
const PDF = '%PDF-1.4\n% http report\n';
const API = '/api/plugins/nextcloud';

const tree = (): MockShare => ({
  name: 'Projektunterlagen',
  files: {
    'Bericht.pdf': { content: PDF, mime: 'application/pdf', fileid: 101 },
    'Notizen.txt': { content: 'Plain notes', mime: 'text/plain', fileid: 102 },
    'Q3/Plan.md': { content: '# Plan', mime: 'text/markdown', fileid: 103 },
    'Q3/Seite.html': { content: '<script>alert(1)</script>', mime: 'text/html', fileid: 104 },
  },
  folders: ['Leer'],
});
const shares = (): Record<string, MockShare> => ({ [OPEN]: tree(), [REFUSED]: tree() });

type Collection = { id: string; title: string; href: string };
type Doc = { id: string; href: string; title: string };

describe.skipIf(app.skipped)('a Nextcloud share, passed on', () => {
  const served = app as ServedApp;
  let mock: MockNextcloud;
  beforeAll(async () => {
    mock = await startMockNextcloud(shares());
  });
  afterAll(async () => {
    await mock.close();
    await served.close();
  });

  // An address per test: the plugin routes' rate budget is per client address.
  let clients = 0;
  let from = '';
  beforeEach(() => {
    from = `198.51.100.${++clients}`;
    mock.mode = 'ok';
    mock.version = '29.0.3.2';
    mock.shares.clear();
    for (const [token, share] of Object.entries(shares())) mock.shares.set(token, share);
  });

  const req = (path: string, options: CallOptions = {}) => call(served, path, { from, ...options });

  async function configure(values: Record<string, string> = {}) {
    const result = await formAction(served, '/settings/integrations/nextcloud?/save', { enabled: 'on', origin: mock.origin, cacheSeconds: '0', ...values }, { as: 'admin', from });
    expect(result.type, JSON.stringify(result.data)).toBe('success');
  }

  /** Beside a restricted page, then made public so anonymous readers reach it. */
  async function connect(token = OPEN): Promise<Collection> {
    const page = await createPage(served, 'admin', { visibility: 'restricted' });
    const res = await req(`${API}/collections`, { as: 'admin', json: { pageId: page.id, shareUrl: `${mock.origin}/s/${token}` } });
    expect(res.status, await res.clone().text()).toBe(201);
    const { collection } = (await res.json()) as { collection: Collection };
    expect((await req(`/api/collections/${collection.id}`, { as: 'admin', method: 'PATCH', json: { visibility: 'public' } })).ok).toBe(true);
    return collection;
  }

  async function listing(collectionId: string, options: CallOptions = {}, extra = '') {
    const res = await req(`${API}/listing?c=${collectionId}${extra}`, options);
    const text = await res.text();
    return { status: res.status, text, body: res.ok ? JSON.parse(text) : null };
  }

  /** Follows on-site redirects as the same client, to where a browser's request ends. */
  async function follow(path: string, options: CallOptions = {}): Promise<Response> {
    let res = await req(path, options);
    for (let hops = 0; hops < 5 && res.status >= 300 && res.status < 400; hops++) {
      const location = res.headers.get('location') ?? '';
      expect(location.startsWith('/') && !location.startsWith('//'), location).toBe(true);
      res = await req(location, { as: options.as, cookie: options.cookie });
    }
    return res;
  }

  const openPath = (collectionId: string, path: string, fileid: number, extra = '') => `${API}/open?c=${collectionId}&p=${encodeURIComponent(path)}&f=${fileid}${extra}`;

  describe("a collection's listing", () => {
    it('lists a folder for readers of the collection — sorted, paged, without the token — and hides it from everyone else', async () => {
      await configure();
      const collection = await connect();

      const root = await listing(collection.id, { as: 'admin' });
      expect(root.body).toMatchObject({ state: 'ready', root: 'Projektunterlagen', path: '', total: 4 });
      expect(root.body.entries.map((e: { name: string }) => e.name)).toEqual(['Leer', 'Q3', 'Bericht.pdf', 'Notizen.txt']);
      expect(root.text).not.toContain(OPEN);
      expect(root.text).not.toContain('/public.php/');

      const q3 = await listing(collection.id, { as: 'admin' }, '&p=Q3&sort=name&dir=desc&limit=1');
      expect(q3.body.entries.map((e: { path: string }) => e.path)).toEqual(['Q3/Seite.html']);
      expect(q3.body.total).toBe(2);
      expect((await listing(collection.id, { as: 'admin' }, '&p=../x')).status).toBe(400);

      expect((await listing(collection.id)).body.state).toBe('ready');
      // Restricted: neither a reader without access nor an anonymous one learns it exists.
      expect((await req(`/api/collections/${collection.id}`, { as: 'admin', method: 'PATCH', json: { visibility: 'restricted' } })).ok).toBe(true);
      expect((await listing(collection.id)).status).toBe(404);
      expect((await listing(collection.id, { as: 'viewer' })).status).toBe(404);
      expect((await req(openPath(collection.id, 'Bericht.pdf', 101))).status).toBe(404);
    });
  });

  describe('a file of the share', () => {
    it('is passed on through a grant for this viewer alone, under the served-file rules', async () => {
      await configure();
      const collection = await connect();

      const open = await req(openPath(collection.id, 'Bericht.pdf', 101), { as: 'admin' });
      expect(open.status).toBe(302);
      const location = open.headers.get('location')!;
      expect(location).toMatch(new RegExp(`^${API}/file/v1\\.`));
      expect(location).not.toContain(OPEN);
      expect(open.headers.get('cache-control')).toBe('private, no-store');

      const file = await req(location, { as: 'admin' });
      expect(file.status).toBe(200);
      expect(file.headers.get('content-type')).toBe('application/pdf');
      expect(file.headers.get('x-content-type-options')).toBe('nosniff');
      expect(file.headers.get('cache-control')).toBe('private, no-store');
      expect(file.headers.get('content-disposition')).toMatch(/^inline; filename="Bericht\.pdf"/);
      expect(await file.text()).toBe(PDF);

      const download = await follow(openPath(collection.id, 'Bericht.pdf', 101, '&download=1'), { as: 'admin' });
      expect(download.headers.get('content-disposition')).toMatch(/^attachment;/);
      const text = await follow(openPath(collection.id, 'Notizen.txt', 102), { as: 'admin' });
      expect(text.headers.get('content-security-policy')).toBe("default-src 'none'; sandbox");
      // Markup is never shown inline: a download, sandboxed.
      const html = await follow(openPath(collection.id, 'Q3/Seite.html', 104), { as: 'admin' });
      expect(html.headers.get('content-disposition')).toMatch(/^attachment;/);

      // A file id that is not the file's at that path: nothing.
      expect((await follow(openPath(collection.id, 'Bericht.pdf', 999), { as: 'admin' })).status).toBe(404);
      // A grant altered, or followed by someone it was not minted for: nothing.
      expect((await req(location.slice(0, -3) + (location.endsWith('AAA') ? 'BBB' : 'AAA'), { as: 'admin' })).status).toBe(404);
      expect((await req(location, { as: 'viewer' })).status).toBe(404);
      expect((await req(location)).status).toBe(404);
    });

    it('answers a grant followed after its five minutes with 410 Gone, and reads nothing at Nextcloud', async () => {
      await configure();
      const collection = await connect();
      const open = await req(openPath(collection.id, 'Bericht.pdf', 101), { as: 'admin' });
      expect(open.status).toBe(302);
      const grant = open.headers.get('location')!;
      expect((await req(grant, { as: 'admin' })).status).toBe(200);

      mock.requests.length = 0;
      // The served build runs in this thread, so faking Date fakes its clock; nothing that schedules.
      vi.useFakeTimers({ toFake: ['Date'], now: Date.now() + GRANT_TTL_MS + 1_000 });
      let late: Response;
      try {
        late = await req(grant, { as: 'admin' });
      } finally {
        vi.useRealTimers();
      }
      expect(late.status).toBe(410);
      expect(late.headers.get('cache-control')).toBe('private, no-store');
      expect(await late.text()).toBe('This link has expired. Open the file again from its page.');
      expect(mock.requests).toEqual([]);
    });
  });

  describe('a document made of a file', () => {
    it('is made once, served through its content route and a share link, and never shows the token', async () => {
      await configure();
      const collection = await connect();
      const create = (path: string, fileid: string) => req(`${API}/documents`, { as: 'admin', json: { collectionId: collection.id, path, fileid } });

      const first = await create('Bericht.pdf', '101');
      expect(first.status).toBe(201);
      const { document } = (await first.json()) as { document: Doc };
      expect(document.title).toBe('Bericht.pdf');
      const again = await create('Bericht.pdf', '101');
      expect([again.status, ((await again.json()) as { document: Doc }).document.id]).toEqual([200, document.id]);
      // A file id that is not the file's: no node.
      expect((await create('Notizen.txt', '101')).status).toBe(409);

      const listed = await listing(collection.id, { as: 'admin' });
      expect(listed.body.entries.find((e: { name: string }) => e.name === 'Bericht.pdf').linked).toEqual({ id: document.id, href: document.href });

      const content = await follow(`/api/documents/${document.id}/content`, { as: 'admin' });
      expect(content.status).toBe(200);
      expect(await content.text()).toBe(PDF);

      const link = (await (await req(`/api/documents/${document.id}/share-links`, { as: 'admin', json: { label: 'http' } })).json()) as { id: string; token: string };
      const viaLink = await req(`/share/${link.token}/content`);
      expect(viaLink.status).toBe(302);
      const grant = viaLink.headers.get('location')!;
      expect(await (await req(grant)).text()).toBe(PDF);
      expect((await req(`/api/documents/${document.id}/share-links/${link.id}`, { as: 'admin', method: 'DELETE' })).ok).toBe(true);
      expect((await req(grant)).status).toBe(404);

      for (const path of [collection.href, document.href]) {
        const page = await req(path, { as: 'admin' });
        expect(page.status, path).toBe(200);
        expect(await page.text(), path).not.toContain(OPEN);
      }
      const agent = await connectAs('admin');
      for (const tool of [
        { name: 'get_collection', arguments: { collectionId: collection.id } },
        { name: 'get_document', arguments: { documentId: document.id } },
      ]) {
        const result = JSON.stringify(await agent.callTool(tool));
        expect(result, tool.name).toContain(tool.name === 'get_collection' ? collection.id : document.id);
        expect(result, tool.name).not.toContain(OPEN);
      }
    });
  });

  describe('when the share fails', () => {
    it('shows a reader it unavailable and a writer why; a moved file is bound anew', async () => {
      await configure();
      const collection = await connect();
      const made = await req(`${API}/documents`, { as: 'admin', json: { collectionId: collection.id, path: 'Q3/Plan.md', fileid: '103' } });
      expect(made.status).toBe(201);
      const { document } = (await made.json()) as { document: Doc };
      const content = `/api/documents/${document.id}/content`;
      const check = async () => ((await (await req(`${API}/documents/${document.id}/check`, { as: 'admin', json: {} })).json()) as { document: { status: string } }).document.status;

      // Server down: the last listing, stale; the reason for the writer alone.
      expect((await listing(collection.id, { as: 'admin' })).body.state).toBe('ready');
      mock.mode = 'down';
      expect((await listing(collection.id, { as: 'admin' })).body).toMatchObject({ state: 'stale', reason: 'unreachable' });
      const stale = (await listing(collection.id)).body;
      expect(stale.state).toBe('stale');
      expect(stale.reason).toBeUndefined();

      mock.mode = 'ok';
      mock.shares.get(OPEN)!.revoked = true;
      expect((await listing(collection.id, { as: 'admin' })).body).toMatchObject({ reason: 'revoked' });
      expect((await listing(collection.id)).body.reason).toBeUndefined();
      expect((await follow(content, { as: 'admin' })).status).toBe(404);
      expect(await check()).toBe('revoked');

      // Back, with the file moved: found missing, then rebound as the same node.
      const share = mock.shares.get(OPEN)!;
      share.revoked = false;
      share.files['Archiv/Plan.md'] = share.files['Q3/Plan.md'];
      delete share.files['Q3/Plan.md'];
      expect(await check()).toBe('notFound');
      const rebound = await req(`${API}/documents/${document.id}`, { as: 'admin', method: 'PATCH', json: { path: 'Archiv/Plan.md', fileid: '103' } });
      expect(((await rebound.json()) as { document: unknown }).document).toMatchObject({ id: document.id, path: 'Archiv/Plan.md', status: 'ok' });
      expect(await (await follow(content, { as: 'admin' })).text()).toBe('# Plan');

      // A redirect is never followed: it reads as unreachable.
      mock.mode = 'redirect';
      mock.requests.length = 0;
      expect((await listing(collection.id, { as: 'admin' })).body.reason).toBe('unreachable');
      expect(mock.requests.length).toBeGreaterThan(0);
    });
  });

  describe('the integration turned off', () => {
    it('is asked nothing', async () => {
      await configure();
      const collection = await connect();
      await configure({ enabled: '' });
      mock.requests.length = 0;
      expect((await listing(collection.id, { as: 'admin' })).body).toMatchObject({ state: 'unavailable', reason: 'disabled' });
      expect((await follow(openPath(collection.id, 'Bericht.pdf', 101), { as: 'admin' })).status).toBe(404);
      expect(mock.requests).toHaveLength(0);
    });
  });

  describe('a share Nextcloud refused', () => {
    it('is asked nothing more by its readers until its wait is over — no folder, no file', async () => {
      await configure({ cacheSeconds: '60' });
      const collection = await connect(REFUSED);
      expect((await listing(collection.id, { as: 'admin' })).body.state).toBe('ready');

      mock.shares.get(REFUSED)!.revoked = true;
      // A folder not held yet is asked for, and the share is found gone.
      expect((await listing(collection.id, {}, '&p=Q3')).body.state).toBe('unavailable');
      const asked = mock.requests.length;

      // The root's cached listing went with the refusal; nothing more reaches Nextcloud.
      const root = await listing(collection.id);
      expect(root.body.state).toBe('unavailable');
      expect(root.text).not.toContain('Bericht.pdf');
      expect((await listing(collection.id, {}, '&p=Leer')).body.state).toBe('unavailable');
      expect((await follow(openPath(collection.id, 'Notizen.txt', 102))).status).toBe(404);
      expect(mock.requests.length).toBe(asked);
    });
  });
});
