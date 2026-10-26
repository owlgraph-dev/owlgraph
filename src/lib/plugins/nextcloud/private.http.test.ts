// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { db } from '$lib/platform/db.server';
import { createSession, createUser } from '$lib/features/auth/server';
import { call, cookieFor, formAction, startApp, type ServedApp } from '$tests/integration/http';
import { connectAs as agentAs } from '$tests/integration/mcp';
import { userOf } from '$tests/integration/users';
import { startMockNextcloud, type MockNextcloud, type MockShare, type MockUser } from './e2e/mockNextcloud';

// Nextcloud read as the viewer, against the mock (docs/architecture/authorization.md,
// "Reading another service as the viewer"). People connect through the connect
// flow over HTTP: begin, the mock's approval, one poll.

const app = await startApp();

const API = '/api/plugins/nextcloud';
const SHARE = 'TeamShare1';
const PASSWORD = 'http-test-password';

const team = {
  a: { content: 'A from the team', mime: 'text/plain', fileid: 501 },
  b: { content: 'B from the team', mime: 'text/plain', fileid: 502 },
  secret: { content: 'Only for alice', mime: 'text/plain', fileid: 503 },
};
const BESCHEID = { content: '%PDF-1.4 tax', mime: 'application/pdf', fileid: 510 };
const RECHNUNG = { content: '%PDF-1.4 511', mime: 'application/pdf', fileid: 511 };

// Alice owns Projekte/Team (500). Bob has it shared as "Team (Alice)" without
// geheim.txt, and a Projekte/Team of his own (600); carol has it as "Team",
// without geheim.txt, and Rechnung.pdf shared under Steuer/.
const users = (): Record<string, MockUser> => ({
  alice: {
    loginName: 'alice@example.com',
    displayName: 'Alice Example',
    tree: {
      name: '',
      files: { 'Projekte/Team/a.txt': team.a, 'Projekte/Team/b.txt': team.b, 'Projekte/Team/geheim.txt': team.secret, 'Privat/Bescheid.pdf': BESCHEID, 'Privat/Rechnung.pdf': RECHNUNG },
      folderIds: { 'Projekte/Team': 500 },
    },
  },
  bob: {
    loginName: 'bob',
    displayName: 'Bob Example',
    tree: {
      name: '',
      files: { 'Team (Alice)/a.txt': team.a, 'Team (Alice)/b.txt': team.b, 'Team (Alice)/geheim.txt': team.secret, 'Projekte/Team/bobs-own.txt': { content: 'Bob alone', mime: 'text/plain', fileid: 601 } },
      folderIds: { 'Team (Alice)': 500, 'Projekte/Team': 600 },
    },
    hidden: ['Team (Alice)/geheim.txt'],
  },
  carol: {
    loginName: 'carol',
    displayName: 'Carol Example',
    tree: { name: '', files: { 'Team/a.txt': team.a, 'Team/b.txt': team.b, 'Team/geheim.txt': team.secret, 'Steuer/Rechnung.pdf': RECHNUNG }, folderIds: { Team: 500 } },
    hidden: ['Team/geheim.txt'],
  },
});

// The same folder as a public share.
const shares = (): Record<string, MockShare> => ({
  [SHARE]: { name: 'Team', files: { 'a.txt': team.a, 'b.txt': team.b, 'geheim.txt': team.secret }, folderIds: { '': 500 } },
});

interface Person {
  userId: string;
  cookie: string;
}

interface Listed {
  state: string;
  via: string | null;
  access?: string;
  reason?: string;
  entries: { path: string; name: string; fileid: string | null }[];
}

describe.skipIf(app.skipped)('Nextcloud read as the viewer, served', () => {
  const served = app as ServedApp;
  let mock: MockNextcloud;

  beforeAll(async () => {
    mock = await startMockNextcloud(shares(), users());
  });
  afterAll(async () => {
    await mock.close();
    await served.close();
  });
  beforeEach(() => {
    mock.mode = 'ok';
    mock.flowServer = null;
    mock.requests.length = 0;
    mock.users.clear();
    for (const [uid, user] of Object.entries(users())) mock.users.set(uid, user);
  });

  /** Before any agent's first call, which reads the settings itself. */
  const configure = async () => {
    const result = await formAction(served, '/settings/integrations/nextcloud?/save', { enabled: 'on', origin: mock.origin, cacheSeconds: '0' }, { as: 'admin' });
    expect(result.type, JSON.stringify(result.data)).toBe('success');
  };

  let people = 0;
  async function person(): Promise<Person> {
    const n = ++people;
    const user = await createUser({ email: `reader${n}@private.test`, name: `Reader ${n}`, password: PASSWORD, role: 'editor' });
    return { userId: user.id, cookie: `session=${(await createSession(user.id)).token}` };
  }

  /** Returns the app password they now hold. */
  async function connectAs(who: Person, uid: string): Promise<string> {
    const begun = await call(served, '/api/connections/nextcloud', { cookie: who.cookie, json: {} });
    expect(begun.status, await begun.clone().text()).toBe(200);
    const { approveUrl } = (await begun.json()) as { approveUrl: string };
    const appPassword = mock.approve(approveUrl.split('/').at(-1)!, uid);
    expect(appPassword).toBeTruthy();
    // Approved first, so the first poll reaches Nextcloud at once (later ones are throttled).
    const polled = await call(served, '/api/connections/nextcloud/poll', { cookie: who.cookie, json: {} });
    expect(((await polled.json()) as { state: string }).state).toBe('connected');
    return appPassword!;
  }

  /** In the public default namespace unless restricted. */
  async function pageOf(owner: Person, { doc, visibility }: { doc?: unknown; visibility?: 'restricted' } = {}): Promise<{ id: string; slug: string }> {
    const created = await call(served, '/api/pages', { cookie: owner.cookie, json: {} });
    expect(created.status, await created.clone().text()).toBe(200);
    const page = (await created.json()) as { id: string; slug: string };
    if (doc) expect((await call(served, `/api/pages/${page.id}`, { cookie: owner.cookie, method: 'PUT', json: doc })).ok).toBe(true);
    if (visibility) expect((await call(served, `/api/pages/${page.id}`, { cookie: owner.cookie, method: 'PATCH', json: { visibility } })).ok).toBe(true);
    return page;
  }

  const listing = async (cookie: string | undefined, collectionId: string, path = ''): Promise<Listed> => {
    const res = await call(served, `${API}/listing?c=${collectionId}&p=${encodeURIComponent(path)}`, { cookie });
    expect(res.status, await res.clone().text()).toBe(200);
    return (await res.json()) as Listed;
  };
  const names = (view: Listed) => view.entries.map((e) => e.name);

  /** Follows on-site redirects with the same session. */
  async function follow(path: string, cookie?: string): Promise<Response> {
    let res = await call(served, path, { cookie });
    for (let hops = 0; hops < 5 && res.status >= 300 && res.status < 400; hops++) {
      const next = new URL(res.headers.get('location')!, served.origin);
      expect(next.origin, 'a redirect stays on this site').toBe(served.origin);
      res = await call(served, `${next.pathname}${next.search}`, { cookie });
    }
    return res;
  }

  /** Requests to the mock made while `run` ran. */
  async function during<T>(run: () => Promise<T>): Promise<{ result: T; requests: MockNextcloud['requests'] }> {
    const from = mock.requests.length;
    const result = await run();
    return { result, requests: mock.requests.slice(from) };
  }

  /** A collection of the person's own folder, beside a page of theirs that anyone may read. */
  async function ownCollection(owner: Person, path = 'Projekte/Team', fileid = '500'): Promise<{ id: string; href: string; pageId: string }> {
    const anchor = await pageOf(owner);
    const res = await call(served, `${API}/collections`, { cookie: owner.cookie, json: { pageId: anchor.id, own: { path, fileid } } });
    expect(res.status, await res.clone().text()).toBe(201);
    const { collection } = (await res.json()) as { collection: { id: string; href: string } };
    return { ...collection, pageId: anchor.id };
  }

  const pageDoc = (...blocks: unknown[]) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Above.' }] }, ...blocks] });
  const folderNode = (collectionId: string) => ({ type: 'nextcloudFolder', attrs: { blockId: 'folder-1', collectionId, startPath: '' } });
  const fileNode = (documentId: string) => ({ type: 'nextcloudFile', attrs: { blockId: 'file-1', documentId } });
  const dom = async (path: string, cookie?: string) => {
    const res = await call(served, path, { cookie });
    expect(res.status, path).toBe(200);
    return new JSDOM(await res.text()).window.document;
  };

  describe('Nextcloud read as the viewer', () => {
    it('two people, one folder id: each sees their own listing of it, and nothing of the other', async () => {
      await configure();
      const alice = await person();
      const bob = await person();
      const carol = await person();
      await connectAs(alice, 'alice');
      await connectAs(bob, 'bob');
      const collection = await ownCollection(alice);
      // Alice's path is not stored where others read it.
      const [row] = await db<{ source_ref: Record<string, unknown> }[]>`select source_ref from collections where id = ${collection.id}`;
      expect(row.source_ref).toMatchObject({ fileid: '500', name: 'Team' });
      const collectionPage = await call(served, collection.href, { as: 'admin' });
      expect(collectionPage.status).toBe(200);
      expect(await collectionPage.text()).not.toContain('Projekte/Team');

      for (const round of [1, 2]) {
        const asAlice = await during(() => listing(alice.cookie, collection.id));
        expect(asAlice.result, `alice, round ${round}`).toMatchObject({ state: 'ready', via: 'user' });
        expect(names(asAlice.result)).toEqual(['a.txt', 'b.txt', 'geheim.txt']);
        expect(asAlice.requests.length).toBeGreaterThan(0);
        for (const r of asAlice.requests) expect(r.authUser, r.path).toBe('alice');

        const asBob = await during(() => listing(bob.cookie, collection.id));
        expect(asBob.result, `bob, round ${round}`).toMatchObject({ state: 'ready', via: 'user' });
        // Kept from him by Nextcloud — and never his own Projekte/Team.
        expect(names(asBob.result)).toEqual(['a.txt', 'b.txt']);
        expect(asBob.requests.length).toBeGreaterThan(0);
        for (const r of asBob.requests) expect(r.authUser, r.path).toBe('bob');
        expect(asBob.requests.some((r) => r.method === 'PROPFIND' && r.path === '/remote.php/dav/files/bob/Team%20(Alice)')).toBe(true);
        expect(asBob.requests.some((r) => r.path.startsWith('/remote.php/dav/files/bob/Projekte'))).toBe(false);
      }
      expect(mock.requests.filter((r) => r.method === 'SEARCH').map((r) => r.authUser).sort()).toEqual(['alice', 'bob']);

      expect((await call(served, `${API}/listing?c=${collection.id}&p=..%2FPrivat`, { cookie: alice.cookie })).status).toBe(400);

      const open = (who: Person, path: string, fileid: string) => follow(`${API}/open?c=${collection.id}&p=${encodeURIComponent(path)}&f=${fileid}`, who.cookie);
      expect(await (await open(bob, 'a.txt', '501')).text()).toBe('A from the team');
      expect((await open(bob, 'geheim.txt', '503')).status).toBe(404);
      expect(await (await open(alice, 'geheim.txt', '503')).text()).toBe('Only for alice');

      // Carol is signed in but not connected.
      expect(await listing(carol.cookie, collection.id)).toMatchObject({ state: 'unavailable', via: null, access: 'connect', entries: [] });
      const anon = await listing(undefined, collection.id);
      expect(anon).toMatchObject({ state: 'unavailable', via: null, entries: [] });
      expect(anon.access).toBeUndefined();
      expect(anon.reason).toBeUndefined();
    });

    it("a share's folder reads through a connected viewer's own files, through the share for everyone else — and a grant reads the way it was made", async () => {
      await configure();
      const owner = await person();
      const anchor = await pageOf(owner);
      const made = await call(served, `${API}/collections`, { cookie: owner.cookie, json: { pageId: anchor.id, shareUrl: `${mock.origin}/s/${SHARE}` } });
      expect(made.status, await made.clone().text()).toBe(201);
      const { collection } = (await made.json()) as { collection: { id: string } };
      // The share's root, by its id: what a connected viewer finds in their own files.
      const [row] = await db<{ source_ref: Record<string, unknown> }[]>`select source_ref from collections where id = ${collection.id}`;
      expect(row.source_ref.fileid).toBe('500');

      const alice = await person();
      await connectAs(alice, 'alice');
      const asAlice = await during(() => listing(alice.cookie, collection.id));
      expect(asAlice.result).toMatchObject({ state: 'ready', via: 'user' });
      expect(asAlice.requests.every((r) => !r.path.startsWith('/public.php/'))).toBe(true);

      const asVisitor = await during(() => listing(undefined, collection.id));
      expect(asVisitor.result).toMatchObject({ state: 'ready', via: 'node' });
      expect(names(asVisitor.result)).toEqual(['a.txt', 'b.txt', 'geheim.txt']);
      expect(asVisitor.requests.every((r) => r.path.startsWith('/public.php/'))).toBe(true);

      const grantOf = async (cookie?: string) => {
        const res = await call(served, `${API}/open?c=${collection.id}&p=a.txt&f=501`, { cookie });
        expect(res.status).toBe(302);
        return res.headers.get('location')!;
      };
      const aliceGrant = await grantOf(alice.cookie);
      const shareGrant = await grantOf();

      // Disconnected, her grant reads with her connection or not at all, never through the share.
      expect((await call(served, '/api/connections/nextcloud', { cookie: alice.cookie, method: 'DELETE' })).ok).toBe(true);
      const redeemed = await during(() => call(served, aliceGrant, { cookie: alice.cookie }));
      expect(redeemed.result.status).toBe(403);
      expect(redeemed.requests).toHaveLength(0);
      expect(await (await follow(shareGrant)).text()).toBe('A from the team');
      expect(await listing(alice.cookie, collection.id)).toMatchObject({ state: 'ready', via: 'node' });
    });

    it('a connection Nextcloud refuses is asked once, turns revoked, and reads again once connected anew', async () => {
      await configure();
      const alice = await person();
      const first = await connectAs(alice, 'alice');
      const collection = await ownCollection(alice);
      expect(await listing(alice.cookie, collection.id)).toMatchObject({ state: 'ready', via: 'user' });

      mock.revokeAppPasswords('alice');
      const refused = await during(async () => {
        const views: Listed[] = [];
        for (let i = 0; i < 3; i++) views.push(await listing(alice.cookie, collection.id));
        return views;
      });
      for (const view of refused.result) expect(view).toMatchObject({ state: 'unavailable', via: null, access: 'renew' });
      const withOld = refused.requests.filter((r) => r.authorization === `Basic ${Buffer.from(`alice@example.com:${first}`).toString('base64')}`);
      expect(withOld).toHaveLength(1);
      const [connection] = await db<{ status: string }[]>`select status from user_connections where user_id = ${alice.userId}`;
      expect(connection.status).toBe('revoked');

      const page = await dom('/settings/connections', alice.cookie);
      const nextcloud = [...page.querySelectorAll('[role="group"]')].find((g) => page.getElementById(g.getAttribute('aria-labelledby') ?? '')?.textContent?.trim() === 'Nextcloud')!;
      expect(nextcloud.textContent).toContain('no longer accepts');
      expect([...nextcloud.querySelectorAll('button')].map((b) => b.textContent?.trim())).toContain('Connect again');

      await connectAs(alice, 'alice');
      expect(await listing(alice.cookie, collection.id)).toMatchObject({ state: 'ready', via: 'user' });
    });

    it('keeps the app password out of every page, answer, address and agent view — and a private folder out of anyone else’s page', async () => {
      await configure();
      // The agent reads as a seeded editor (tests/integration/mcp.ts), so alice is editorA.
      const alice: Person = { userId: (await userOf('editorA')).id, cookie: await cookieFor('editorA') };
      const password = await connectAs(alice, 'alice');
      const collection = await ownCollection(alice);
      const made = await call(served, `${API}/documents`, { cookie: alice.cookie, json: { besidePageId: collection.pageId, own: { path: 'Privat/Bescheid.pdf', fileid: '510' } } });
      expect(made.status, await made.clone().text()).toBe(201);
      const { document } = (await made.json()) as { document: { id: string; href: string; own: boolean; path: string | null } };
      expect(document).toMatchObject({ own: true, path: null });
      // The same file in the same namespace is the same node.
      const again = await call(served, `${API}/documents`, { cookie: alice.cookie, json: { besidePageId: collection.pageId, own: { path: 'Privat/Bescheid.pdf', fileid: '510' } } });
      expect(again.status).toBe(200);
      expect(((await again.json()) as { document: { id: string } }).document.id).toBe(document.id);

      const shown = await pageOf(alice, { doc: pageDoc(folderNode(collection.id)) });
      const seen: string[] = [];
      const page = await call(served, `/${shown.slug}`, { cookie: alice.cookie });
      expect(page.status).toBe(200);
      seen.push(await page.text());
      const content = await call(served, `/api/documents/${document.id}/content`, { cookie: alice.cookie });
      expect(content.status).toBe(302);
      seen.push(content.headers.get('location') ?? '');
      const bytes = await follow(`/api/documents/${document.id}/content`, alice.cookie);
      expect(bytes.status).toBe(200);
      seen.push(await bytes.text());
      const listed = await listing(alice.cookie, collection.id);
      expect(names(listed)).toEqual(['a.txt', 'b.txt', 'geheim.txt']);
      seen.push(JSON.stringify(listed));

      const agent = await agentAs('editorA');
      for (const tool of [
        { name: 'get_page_html', arguments: { pageId: shown.id } },
        { name: 'get_collection', arguments: { collectionId: collection.id } },
        { name: 'get_document', arguments: { documentId: document.id } },
      ]) {
        const result = await agent.callTool(tool);
        expect(result.isError, tool.name).toBeFalsy();
        seen.push(JSON.stringify(result));
      }
      expect(seen.length).toBeGreaterThan(5);
      for (const text of seen) {
        expect(text).not.toContain(password);
        expect(text).not.toContain('Privat/Bescheid');
      }

      const anonymous = await call(served, `/${shown.slug}`);
      expect(anonymous.status).toBe(200);
      const html = await anonymous.text();
      for (const name of ['a.txt', 'b.txt', 'geheim.txt', 'Projekte']) expect(html).not.toContain(name);
    });
  });

  describe('a folder read from each viewer’s own files', () => {
    it('stays unread where owlgraph lets nobody read it, connection or not', async () => {
      await configure();
      const alice = await person();
      await connectAs(alice, 'alice');
      const collection = await ownCollection(alice);
      expect((await call(served, `/api/collections/${collection.id}`, { cookie: alice.cookie, method: 'PATCH', json: { visibility: 'restricted' } })).ok).toBe(true);
      const { slug } = await pageOf(alice, { doc: { type: 'doc', content: [folderNode(collection.id)] }, visibility: 'restricted' });

      const carol = await person();
      await connectAs(carol, 'carol');
      expect((await call(served, `/${slug}`, { cookie: carol.cookie })).status).toBe(404);
      expect((await call(served, `${API}/listing?c=${collection.id}`, { cookie: carol.cookie })).status).toBe(404);
      expect((await call(served, `${API}/open?c=${collection.id}&p=a.txt&f=501`, { cookie: carol.cookie })).status).toBe(404);
      // Her connection was never asked.
      expect(mock.requests.filter((r) => r.authUser === 'carol' && r.path.startsWith('/remote.php/'))).toEqual([]);
    });
  });

  describe('a file read from each viewer’s own files', () => {
    it('opens for a connected reader, asks one who is not to connect, and is unavailable to anyone else', async () => {
      await configure();
      const alice = await person();
      await connectAs(alice, 'alice');
      const anchor = await pageOf(alice);
      const made = await call(served, `${API}/documents`, { cookie: alice.cookie, json: { besidePageId: anchor.id, own: { path: 'Privat/Rechnung.pdf', fileid: '511' } } });
      expect(made.status, await made.clone().text()).toBe(201);
      const { document } = (await made.json()) as { document: { id: string } };
      const { slug } = await pageOf(alice, { doc: pageDoc(fileNode(document.id)) });

      const mine = (await dom(`/${slug}`, alice.cookie)).querySelector('.de')!;
      expect(mine.getAttribute('data-state')).toBe('ready');
      const href = mine.querySelector('a.de-entry')!.getAttribute('href')!;
      expect(await (await follow(href, alice.cookie)).text()).toBe('%PDF-1.4 511');

      const carol = await person();
      const hers = (await dom(`/${slug}`, carol.cookie)).querySelector('.de')!;
      expect(hers.textContent).toContain('Connect your Nextcloud to open this file');
      const connect = [...hers.querySelectorAll('a')].find((a) => a.textContent?.trim() === 'Connect Nextcloud');
      expect(connect?.getAttribute('href')).toBe(`/settings/connections?return=${encodeURIComponent(`/${slug}`)}`);
      // Connected, she reads it from her own files, at her own path.
      await connectAs(carol, 'carol');
      expect((await dom(`/${slug}`, carol.cookie)).querySelector('.de')!.getAttribute('data-state')).toBe('ready');
      expect(await (await follow(href, carol.cookie)).text()).toBe('%PDF-1.4 511');
      expect(mock.requests.some((r) => r.authUser === 'carol' && r.method === 'GET' && r.path === '/remote.php/dav/files/carol/Steuer/Rechnung.pdf')).toBe(true);

      expect((await dom(`/${slug}`)).querySelector('.de')!.getAttribute('data-state')).toBe('unavailable');
      expect((await follow(href)).status).toBe(404);
    });
  });

  describe('without an active connection', () => {
    it('lists none of the person’s own files and makes nothing of them — asked to connect, or to connect again — and Nextcloud is asked nothing', async () => {
      await configure();
      const dave = await person();
      const anchor = await pageOf(dave);
      const count = async () => (await db<{ collections: number; documents: number }[]>`
        select (select count(*)::int from collections) as collections, (select count(*)::int from documents) as documents`)[0];
      const before = await count();

      const attempts = async (access: 'connect' | 'renew') => {
        const tried = await during(async () => {
          const own = await call(served, `${API}/own/listing?p=`, { cookie: dave.cookie });
          expect(own.status).toBe(200);
          expect(await own.json()).toMatchObject({ state: 'unavailable', access, connectHref: '/settings/connections', entries: [], folder: null });
          const collection = await call(served, `${API}/collections`, { cookie: dave.cookie, json: { pageId: anchor.id, own: { path: 'Projekte/Team', fileid: '500' } } });
          expect(collection.status).toBe(409);
          expect(await collection.json()).toMatchObject({ error: { code: access === 'connect' ? 'connect_required' : 'connection_renew' } });
          const document = await call(served, `${API}/documents`, { cookie: dave.cookie, json: { besidePageId: anchor.id, own: { path: 'Privat/Rechnung.pdf', fileid: '511' } } });
          expect(document.status).toBe(409);
          expect(await document.json()).toMatchObject({ error: { code: access === 'connect' ? 'connect_required' : 'connection_renew' } });
        });
        expect(tried.requests, `nothing read with ${access}`).toEqual([]);
        expect(await count()).toEqual(before);
      };

      await attempts('connect');
      await connectAs(dave, 'alice');
      await db`update user_connections set status = 'revoked' where user_id = ${dave.userId}`;
      await attempts('renew');
    });
  });
});
