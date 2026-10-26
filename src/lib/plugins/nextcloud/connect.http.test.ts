// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { db } from '$lib/platform/db.server';
import { createSession, createUser } from '$lib/features/auth/server';
import { call, createPage, formAction, startApp, type CallOptions, type ServedApp } from '$tests/integration/http';
import type { Role } from '$tests/integration/users';
import { startMockNextcloud, type MockNextcloud, type MockShare } from './e2e/mockNextcloud';

// The integration's settings and shares as served, against the mock
// (docs/architecture/nextcloud.md). Settings go through the form: the
// served build caches them, and only its own save refreshes them.

const app = await startApp();

const OPEN = 'HttpOpenShare1';
const LOCKED = 'HttpLockedShare2';
const PASSWORD = 'geheim-http';
const PDF = '%PDF-1.4\n% http report\n';
const API = '/api/plugins/nextcloud';

const shares = (): Record<string, MockShare> => ({
  [OPEN]: {
    name: 'Projektunterlagen',
    files: {
      'Bericht.pdf': { content: PDF, mime: 'application/pdf', fileid: 101 },
      'Notizen.txt': { content: 'Plain notes', mime: 'text/plain', fileid: 102 },
    },
    folders: ['Leer'],
  },
  [LOCKED]: { name: 'Intern', password: PASSWORD, files: { 'Vertrag.pdf': { content: PDF, mime: 'application/pdf', fileid: 201 } } },
});

type Collection = { id: string; title: string; href: string };
type Doc = { id: string; href: string; title: string };

describe.skipIf(app.skipped)('the Nextcloud integration, served', () => {
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
  const dom = async (res: Response) => new JSDOM(await res.text()).window.document;

  async function configure(values: Record<string, string> = {}) {
    const result = await formAction(served, '/settings/integrations/nextcloud?/save', { enabled: 'on', origin: mock.origin, cacheSeconds: '0', ...values }, { as: 'admin', from });
    expect(result.type, JSON.stringify(result.data)).toBe('success');
  }

  /** Beside a restricted page, then made public so anonymous readers reach it. */
  async function connect(token = OPEN, password?: string): Promise<Collection> {
    const page = await createPage(served, 'admin', { visibility: 'restricted' });
    const res = await req(`${API}/collections`, { as: 'admin', json: { pageId: page.id, shareUrl: `${mock.origin}/s/${token}`, ...(password ? { password } : {}) } });
    expect(res.status, await res.clone().text()).toBe(201);
    const { collection } = (await res.json()) as { collection: Collection };
    expect((await req(`/api/collections/${collection.id}`, { as: 'admin', method: 'PATCH', json: { visibility: 'public' } })).ok).toBe(true);
    return collection;
  }

  async function makeDocument(collectionId: string, path: string, fileid: string): Promise<Doc> {
    const res = await req(`${API}/documents`, { as: 'admin', json: { collectionId, path, fileid } });
    expect(res.status, await res.clone().text()).toBe(201);
    return ((await res.json()) as { document: Doc }).document;
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

  /** Returns their session cookie. */
  let people = 0;
  async function person(role: 'editor' | 'viewer') {
    const user = await createUser({ email: `${role}-${++people}@nextcloud.http.test`, name: `${role} ${people}`, password: 'http-seed-password', role });
    return `session=${(await createSession(user.id)).token}`;
  }

  describe('its settings page', () => {
    // Posted as a browser without JavaScript does: the page renders the action's answer.
    const post = (action: string, fields: Record<string, string>) =>
      req(`/settings/integrations/nextcloud?/${action}`, { as: 'admin', body: new URLSearchParams(fields) });

    it('sets it up: an address checked, the server probed, then turned on', async () => {
      const page = await dom(await req('/settings/integrations/nextcloud', { as: 'admin' }));
      expect(page.querySelector('h1')?.textContent?.trim()).toBe('Nextcloud');

      // Plain http to a non-loopback host is refused even with the loopback flag set.
      const insecure = await post('save', { enabled: 'on', origin: 'http://cloud.example.org', cacheSeconds: '0' });
      expect(insecure.status).toBe(400);
      expect((await dom(insecure)).querySelector('#integration-origin-error')?.textContent?.trim()).toBe('The address must start with https://.');
      const refused = await formAction(served, '/settings/integrations/nextcloud?/save', { enabled: 'on', origin: 'http://cloud.example.org', cacheSeconds: '0' }, { as: 'admin', from });
      expect([refused.type, (refused.data as { problems: Record<string, string> }).problems.origin]).toEqual(['failure', 'origin-insecure']);

      const outcome = async (res: Response) => (await dom(res)).querySelector('.outcome')?.textContent?.trim();
      expect(await outcome(await post('check', { origin: mock.origin, cacheSeconds: '0' }))).toBe('Nextcloud 29.0.3 answers at this address.');
      mock.version = '28.0.4.1';
      expect(await outcome(await post('check', { origin: mock.origin, cacheSeconds: '0' }))).toMatch(/Nextcloud 28\.0\.4 answers, but shares need version 29/);

      const saved = await formAction(served, '/settings/integrations/nextcloud?/save', { enabled: 'on', origin: mock.origin, cacheSeconds: '0' }, { as: 'admin', from });
      expect(saved.type).toBe('success');
      const after = await dom(await req('/settings/integrations/nextcloud', { as: 'admin' }));
      expect(after.querySelector('#integration-origin')?.getAttribute('value')).toBe(mock.origin);
      const enabled = after.querySelector('[role="checkbox"]');
      expect(enabled?.textContent?.trim()).toBe('Turn the integration on');
      expect(enabled?.getAttribute('aria-checked')).toBe('true');
    });
  });

  describe('connecting a share beside a page', () => {
    it("is refused for another server, a wrong password or a share that isn't there — and made with the right password, carrying neither token nor password", async () => {
      await configure();
      const { id: pageId } = await createPage(served, 'admin', { visibility: 'restricted' });
      const post = (data: Record<string, string>) => req(`${API}/collections`, { as: 'admin', json: { pageId, ...data } });
      const answer = async (res: Response) => [res.status, ((await res.json()) as { error?: { code?: string } }).error?.code];

      expect(await answer(await post({ shareUrl: `https://elsewhere.example/s/${OPEN}` }))).toEqual([400, 'other_origin']);
      expect(await answer(await post({ shareUrl: `${mock.origin}/s/${LOCKED}`, password: 'falsch' }))).toEqual([400, 'refused']);
      expect(await answer(await post({ shareUrl: `${mock.origin}/s/NoSuchShare99` }))).toEqual([404, 'revoked']);
      expect((await post({ shareUrl: `${mock.origin}/apps/files` })).status).toBe(400);

      const made = await post({ shareUrl: `${mock.origin}/s/${LOCKED}`, password: PASSWORD });
      expect(made.status).toBe(201);
      const text = await made.text();
      expect(text).not.toContain(LOCKED);
      expect(text).not.toContain(PASSWORD);
      const { collection } = JSON.parse(text) as { collection: Collection };
      expect(collection.title).toBe('Intern');
      const view = await req(collection.href, { as: 'admin' });
      expect(view.status).toBe(200);
      expect((await dom(view)).querySelector('h1')?.textContent?.trim()).toBe('Intern');
    });
  });

  describe("a share's credential", () => {
    it('is never checked for a caller who may not make a collection beside the page', async () => {
      await configure();
      const target = await createPage(served, 'admin', { visibility: 'restricted' });
      const before = mock.requests.length;
      const res = await req(`${API}/collections`, { as: 'viewer', json: { pageId: target.id, shareUrl: `${mock.origin}/s/${LOCKED}`, password: 'geraten' } });
      expect(res.status).toBe(403);
      // Nothing went to Nextcloud, so the answer says nothing of the password.
      expect(mock.requests.slice(before)).toEqual([]);
    });

    it('is checked for a person only a few times while it fails, and nothing more of theirs reaches Nextcloud', async () => {
      await configure();
      const cookie = await person('editor');
      const created = await req('/api/pages', { cookie, json: {} });
      expect(created.ok).toBe(true);
      const own = (await created.json()) as { id: string };
      expect((await req(`/api/pages/${own.id}`, { cookie, method: 'PATCH', json: { visibility: 'restricted' } })).ok).toBe(true);
      const attempt = (password: string) => req(`${API}/collections`, { cookie, json: { pageId: own.id, shareUrl: `${mock.origin}/s/${LOCKED}`, password } });

      for (let i = 0; i < 10; i++) expect((await attempt(`falsch-${i}`)).status).toBe(400);
      const before = mock.requests.length;
      const spent = await attempt(PASSWORD);
      expect(spent.status).toBe(429);
      expect(spent.headers.get('retry-after')).toBeTruthy();
      expect(mock.requests.slice(before)).toEqual([]);
      // Another person's budget is their own.
      await connect(LOCKED, PASSWORD);
    });

    it('goes only to the address it was made for', async () => {
      await configure();
      const collection = await connect(LOCKED, PASSWORD);
      expect((await listing(collection.id, { as: 'admin' })).body.state).toBe('ready');

      const elsewhere = await startMockNextcloud(shares());
      try {
        await configure({ origin: elsewhere.origin });
        expect((await listing(collection.id, { as: 'admin' })).body?.state).not.toBe('ready');
        // Neither the share nor its password reached the new address.
        expect(elsewhere.requests.filter((r) => r.path.includes(LOCKED) || r.authorization !== null)).toEqual([]);
      } finally {
        await elsewhere.close();
      }

      await configure();
      expect((await listing(collection.id, { as: 'admin' })).body.state).toBe('ready');
    });
  });

  describe('what a share connected beside a page holds', () => {
    it('is no wider than that page — nor a document made from it', async () => {
      await configure();
      const restricted = await createPage(served, 'admin', { visibility: 'restricted' });
      const res = await req(`${API}/collections`, { as: 'admin', json: { pageId: restricted.id, shareUrl: `${mock.origin}/s/${LOCKED}`, password: PASSWORD } });
      expect(res.status, await res.clone().text()).toBe(201);
      const { collection } = (await res.json()) as { collection: Collection };
      const made = await req(`${API}/documents`, { as: 'admin', json: { collectionId: collection.id, path: 'Vertrag.pdf', fileid: '201' } });
      expect(made.ok, await made.clone().text()).toBe(true);
      const { document } = (await made.json()) as { document: Doc };

      const [collectionNode] = await db<{ visibility: string | null }[]>`select visibility from nodes where id = ${collection.id}`;
      const [documentNode] = await db<{ visibility: string | null }[]>`select visibility from nodes where id = ${document.id}`;
      expect(collectionNode.visibility).toBe('restricted');
      expect(documentNode.visibility).toBe('restricted');

      expect(await (await req(collection.href)).text()).not.toContain('Vertrag.pdf');
      expect((await listing(collection.id)).status).toBe(404);
      expect((await follow(`/api/documents/${document.id}/content`)).status).toBe(404);
    });
  });

  describe('a collection connected anew', () => {
    it("with the share's new password lists its folder again, and its documents read with that password", async () => {
      await configure();
      const collection = await connect(LOCKED, PASSWORD);
      const document = await makeDocument(collection.id, 'Vertrag.pdf', '201');
      const content = `/api/documents/${document.id}/content`;
      mock.shares.get(LOCKED)!.password = 'neu-http';
      expect((await listing(collection.id, { as: 'admin' })).body.reason).toBe('unauthorized');
      expect((await follow(content, { as: 'admin' })).status).toBe(404);

      const source = (password: string) =>
        req(`/api/collections/${collection.id}/source`, { as: 'admin', method: 'PUT', json: { values: { shareUrl: `${mock.origin}/s/${LOCKED}`, password } } });
      const refused = await source('falsch');
      expect([refused.status, ((await refused.json()) as { error: { message: string } }).error.message]).toEqual([400, 'Nextcloud refused the password.']);
      const connected = await source('neu-http');
      expect([connected.status, await connected.json()]).toEqual([200, { ok: true }]);

      expect((await listing(collection.id, { as: 'admin' })).body).toMatchObject({ state: 'ready', root: 'Intern' });
      // Its document reads with the new password too, for its writer and an anonymous reader alike.
      for (const as of ['admin', undefined] as const) {
        const read = await follow(content, { as });
        expect(read.status, String(as)).toBe(200);
        expect(await read.text()).toBe(PDF);
      }
      const old = `Basic ${Buffer.from(`anonymous:${PASSWORD}`).toString('base64')}`;
      mock.requests.length = 0;
      await listing(collection.id, { as: 'admin' });
      expect(mock.requests.length).toBeGreaterThan(0);
      expect(mock.requests.filter((r) => r.authorization === old)).toEqual([]);
    });
  });

  describe("a share's documents, for someone who may not write them", () => {
    it('are refused (403) to a signed-in reader making one of a file, rebinding one or checking one — nothing stored, nothing asked of Nextcloud', async () => {
      await configure();
      const collection = await connect();
      const pluginDocuments = async () => (await db<{ n: number }[]>`select count(*)::int as n from documents where plugin = 'nextcloud'`)[0].n;
      const before = await pluginDocuments();
      mock.requests.length = 0;

      // The collection is public: readable, not writable.
      expect((await listing(collection.id, { as: 'viewer' })).body.state).toBe('ready');
      mock.requests.length = 0;
      const made = await req(`${API}/documents`, { as: 'viewer', json: { collectionId: collection.id, path: 'Bericht.pdf', fileid: '101' } });
      expect(made.status).toBe(403);
      expect(await pluginDocuments()).toBe(before);
      expect(mock.requests).toEqual([]);

      // As public as its collection: readable, not writable.
      const document = await makeDocument(collection.id, 'Notizen.txt', '102');
      expect((await req(`${API}/documents/${document.id}`, { as: 'viewer' })).status).toBe(200);
      const stored = async () => (await db<{ source_ref: unknown; filename: string }[]>`select source_ref, filename from documents where id = ${document.id}`)[0];
      const kept = await stored();
      mock.requests.length = 0;
      expect((await req(`${API}/documents/${document.id}`, { as: 'viewer', method: 'PATCH', json: { path: 'Bericht.pdf', fileid: '101' } })).status).toBe(403);
      expect((await req(`${API}/documents/${document.id}/check`, { as: 'viewer', json: {} })).status).toBe(403);
      expect(await stored()).toEqual(kept);
      expect(mock.requests).toEqual([]);
    });
  });

  describe("the core's and the plugin's JSON for a share's nodes", () => {
    it('carries no share token, share password or sealed secret — the collection, the document, and both searches', async () => {
      await configure();
      const collection = await connect(LOCKED, PASSWORD);
      const document = await makeDocument(collection.id, 'Vertrag.pdf', '201');
      const sealed = (await db<{ sealed: string }[]>`select sealed from node_source_secrets where node_id in (${collection.id}, ${document.id})`).map((r) => r.sealed);
      expect(sealed).toHaveLength(2);

      const answers: [path: string, names: string, as: Role][] = [
        [`/api/collections/${collection.id}`, collection.id, 'admin'],
        [`/api/documents/${document.id}`, document.id, 'admin'],
        [`${API}/documents/${document.id}`, document.id, 'admin'],
        [`${API}/collections?q=Intern`, collection.id, 'admin'],
        [`${API}/documents?q=Vertrag`, document.id, 'admin'],
        [`/api/collections/${collection.id}`, collection.id, 'viewer'],
        [`${API}/collections?q=Intern`, collection.id, 'viewer'],
      ];
      for (const [path, names, as] of answers) {
        const res = await req(path, { as });
        expect(res.status, path).toBe(200);
        const text = await res.text();
        expect(text, path).toContain(names);
        for (const secret of [LOCKED, PASSWORD, ...sealed]) expect(text, path).not.toContain(secret);
      }
    });
  });
});
