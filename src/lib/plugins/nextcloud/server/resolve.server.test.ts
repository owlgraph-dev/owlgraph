// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Against the mock server through the real pinned client.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { startMockNextcloud, type MockNextcloud, type MockUser } from '../e2e/mockNextcloud';
import { fakeHost } from '../e2e/fakeHost';
import { encodeSecret, propfind, searchById, userAccess } from './client.server';
import { clearLocations } from './locations.server';
import { clearListings } from './cache.server';
import { listingOf } from './listing.server';
import { resolveNode } from './resolve.server';
import type { PluginNode, PluginOpenConnection } from '$lib/plugins/api';

const SHARE = 'TeamShare123';
const team = { content: 'A', mime: 'text/plain', fileid: 501 };

const users: Record<string, MockUser> = {
  alice: {
    loginName: 'alice@example.org',
    displayName: 'Alice',
    tree: { name: '', files: { 'Projekte/Team/a.txt': team, 'Projekte/Team/geheim.txt': { content: 'S', mime: 'text/plain', fileid: 503 }, 'Extern/Archiv/x.txt': { content: 'X', mime: 'text/plain', fileid: 701 } }, folderIds: { 'Projekte/Team': 500, 'Extern/Archiv': 700 } },
    unsearchable: ['Extern'],
  },
  bob: {
    loginName: 'bob',
    displayName: 'Bob',
    tree: { name: '', files: { 'Team (Alice)/a.txt': team, 'Team (Alice)/geheim.txt': { content: 'S', mime: 'text/plain', fileid: 503 } }, folderIds: { 'Team (Alice)': 500 } },
    hidden: ['Team (Alice)/geheim.txt'],
  },
};

let mock: MockNextcloud;
beforeAll(async () => {
  process.env.INTEGRATIONS_ALLOW_HTTP_LOOPBACK = '1';
  mock = await startMockNextcloud({ [SHARE]: { name: 'Team', files: { 'a.txt': team }, folderIds: { '': 500 } } }, users);
  mock.appPasswords.set('pw-alice-7Kq', 'alice');
  mock.appPasswords.set('pw-bob-3Zx', 'bob');
});
afterAll(() => mock.close());
beforeEach(() => {
  mock.mode = 'ok';
  mock.requests.length = 0;
  clearLocations();
  clearListings();
});

const connection = (uid: 'alice' | 'bob', secret = uid === 'alice' ? 'pw-alice-7Kq' : 'pw-bob-3Zx'): PluginOpenConnection => ({
  id: `connection-${uid}-${secret}`,
  accountId: uid,
  accountLabel: users[uid].displayName,
  credential: { kind: 'app_password', login: users[uid].loginName, secret },
});

function hostFor(opts: { viewer?: string | null; open?: PluginOpenConnection | null; status?: 'none' | 'active' | 'renew'; share?: boolean }) {
  const refused: string[] = [];
  let open = opts.open ?? null;
  const host = fakeHost({
    origin: mock.origin,
    viewerId: opts.viewer === undefined ? 'viewer-1' : opts.viewer,
    cacheSeconds: 0,
    connection: {
      open: async () => open,
      status: async () => (refused.length ? 'renew' : (opts.status ?? (open ? 'active' : 'none'))),
      refused: async (id) => {
        refused.push(id);
        open = null;
      },
    },
    secrets: { get: async () => (opts.share ? encodeSecret({ token: SHARE, password: null }) : null) },
    nodes: { canWrite: async () => false, members: async () => [], observe: async () => true },
  });
  return { host, refused };
}

const collection = (ref: Record<string, unknown>): PluginNode => ({ id: '6f1c1a52-0c5a-4b8e-9d0f-6b1f0e2a9c11', type: 'collection', title: 'Team', href: '/team', ref, file: null, content: null });
const query = { path: '', sort: 'name' as const, dir: 'asc' as const, offset: 0, limit: 50 };

describe("a person's own files", () => {
  it('are read as them, by their app password, under their own root', async () => {
    const { host } = hostFor({});
    const access = userAccess(connection('alice'))!;
    const listed = await propfind(host, access, 'Projekte/Team', 1, 'test');
    expect(listed.ok && listed.entries.map((e) => e.path)).toEqual(['Projekte/Team', 'Projekte/Team/a.txt', 'Projekte/Team/geheim.txt']);
    expect(mock.requests[0]).toMatchObject({ method: 'PROPFIND', path: '/remote.php/dav/files/alice/Projekte/Team', authUser: 'alice', requestedWith: null });
    const found = await searchById(host, access, '500', 'test');
    expect(found.ok && found.entries.map((e) => [e.path, e.fileid])).toEqual([['Projekte/Team', '500']]);
    expect(mock.requests[1]).toMatchObject({ method: 'SEARCH', path: '/remote.php/dav/', authUser: 'alice' });
  });

  it("refuse a wrong app password once: the host is told, nothing is retried, and no log line names it", async () => {
    const { host, refused } = hostFor({});
    const wrong = connection('alice', 'not-the-password');
    const read = await propfind(host, userAccess(wrong)!, 'Projekte/Team', 1, 'test');
    expect(read).toEqual({ ok: false, problem: 'refused' });
    expect(refused).toEqual([wrong.id]);
    expect(mock.requests).toHaveLength(1);
    const logged = JSON.stringify(host.logs);
    for (const secret of ['not-the-password', 'alice@example.org', 'Projekte']) expect(logged).not.toContain(secret);
  });
});

describe('reading a node', () => {
  it("reads through the viewer's own files where they hold its root — each viewer at their own path", async () => {
    const node = collection({ path: '', name: 'Team', fileid: '500' });
    const alice = await resolveNode(hostFor({ open: connection('alice'), share: true }).host, node, { operation: 'test' });
    expect(alice).toMatchObject({ via: 'user', base: 'Projekte/Team', fileid: '500' });
    const bob = await resolveNode(hostFor({ open: connection('bob'), share: true }).host, node, { operation: 'test' });
    expect(bob).toMatchObject({ via: 'user', base: 'Team (Alice)' });
    expect(mock.requests.map((r) => [r.method, r.authUser])).toEqual([
      ['SEARCH', 'alice'],
      ['SEARCH', 'bob'],
    ]);

    // Listed as each: what Nextcloud lets them see.
    const asAlice = await listingOf(hostFor({ open: connection('alice') }).host, node, query, { network: true });
    const asBob = await listingOf(hostFor({ open: connection('bob') }).host, node, query, { network: true });
    expect([asAlice.via, asAlice.entries.map((e) => e.path)]).toEqual(['user', ['a.txt', 'geheim.txt']]);
    expect([asBob.via, asBob.entries.map((e) => e.path)]).toEqual(['user', ['a.txt']]);
  });

  it('falls back to the share where their files do not hold it, and when their connection is refused', async () => {
    const node = collection({ path: '', name: 'Team', fileid: '999' });
    expect(await resolveNode(hostFor({ open: connection('alice'), share: true }).host, node, { operation: 'test' })).toMatchObject({ via: 'node', base: '' });

    const { host, refused } = hostFor({ open: connection('alice', 'revoked-pw'), share: true });
    expect(await resolveNode(host, collection({ path: '', name: 'Team', fileid: '500' }), { operation: 'test' })).toMatchObject({ via: 'node' });
    expect(refused).toHaveLength(1);
  });

  it('says what the viewer can do when there is nothing to read with', async () => {
    const own = collection({ path: '', name: 'Team', fileid: '500', pathHint: 'Projekte/Team', hintUid: 'alice' });
    expect(await resolveNode(hostFor({ viewer: null }).host, own, { operation: 'test' })).toMatchObject({ via: null, reason: 'unavailable' });
    expect(await resolveNode(hostFor({}).host, own, { operation: 'test' })).toMatchObject({ via: null, reason: 'connect' });
    expect(await resolveNode(hostFor({ status: 'renew' }).host, own, { operation: 'test' })).toMatchObject({ via: null, reason: 'renew' });
    // Connected but not among their files: connecting would not help.
    const elsewhere = collection({ path: '', name: 'Team', fileid: '999' });
    expect(await resolveNode(hostFor({ open: connection('bob') }).host, elsewhere, { operation: 'test' })).toMatchObject({ via: null, reason: 'unavailable', problem: 'notFound' });
    // A node with no id to look for: connecting would not help either.
    expect(await resolveNode(hostFor({}).host, collection({ path: '', name: 'Team' }), { operation: 'test' })).toMatchObject({ via: null, reason: 'unavailable' });
  });

  it("finds what a search does not at its picker's path — for the picker alone", async () => {
    const node = collection({ path: '', name: 'Archiv', fileid: '700', pathHint: 'Extern/Archiv', hintUid: 'alice' });
    expect(await resolveNode(hostFor({ open: connection('alice') }).host, node, { operation: 'test' })).toMatchObject({ via: 'user', base: 'Extern/Archiv' });
    // Another person is never looked for at someone else's path.
    mock.requests.length = 0;
    expect(await resolveNode(hostFor({ open: connection('bob') }).host, node, { operation: 'test' })).toMatchObject({ via: null });
    expect(mock.requests.map((r) => r.method)).toEqual(['SEARCH']);
    // A path that now holds another id is no hint.
    const moved = collection({ path: '', name: 'Archiv', fileid: '700', pathHint: 'Projekte/Team', hintUid: 'alice' });
    clearLocations();
    expect(await resolveNode(hostFor({ open: connection('alice') }).host, moved, { operation: 'test' })).toMatchObject({ via: null, problem: 'notFound' });
  });

  it('keeps where it was found per connection, and finds it anew once it moved', async () => {
    const node = collection({ path: '', name: 'Team', fileid: '500' });
    const { host } = hostFor({ open: connection('alice') });
    await resolveNode(host, node, { operation: 'test' });
    await resolveNode(host, node, { operation: 'test' });
    expect(mock.requests.filter((r) => r.method === 'SEARCH')).toHaveLength(1);
    // Moved in her files: id 500 is no longer at the held path, so it is searched again.
    const tree = mock.users.get('alice')!.tree;
    const files = Object.fromEntries(Object.entries(tree.files).map(([p, f]) => [p.replace('Projekte/Team/', 'Archiv 2026/Team/'), f]));
    mock.users.set('alice', { ...users.alice, tree: { ...tree, files, folderIds: { 'Archiv 2026/Team': 500, 'Projekte/Team': 900 } } });
    const after = await listingOf(host, node, query, { network: true });
    expect([after.state, after.via, after.entries.map((e) => e.path)]).toEqual(['ready', 'user', ['a.txt', 'geheim.txt']]);
    expect(mock.requests.filter((r) => r.method === 'SEARCH')).toHaveLength(2);
    mock.users.set('alice', users.alice);
  });
});
