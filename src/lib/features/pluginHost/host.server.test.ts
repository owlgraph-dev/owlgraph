// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { beforeEach, describe, expect, it, vi } from 'vitest';

// The features the host reads through are faked: who may read and write what is
// a table, so each rule is checked in itself, not along one plugin's paths.

const fake = vi.hoisted(() => {
  // A key the secret box takes: 32 distinct bytes.
  process.env.APP_SECRET_KEY = Buffer.from(Array.from({ length: 32 }, (_, i) => (i * 73 + 41) % 256)).toString('base64');
  return {
    types: new Map<string, string>(),
    collections: new Map<string, Record<string, unknown>>(),
    documents: new Map<string, Record<string, unknown>>(),
    pages: new Map<string, Record<string, unknown>>(),
    /** `${userId}:${nodeId}` — who may read, who may write. */
    readers: new Set<string>(),
    writers: new Set<string>(),
    sealed: new Map<string, string>(),
    origin: 'https://cloud.example' as string | null,
    created: [] as Record<string, unknown>[],
    refs: new Map<string, Record<string, unknown>>(),
  };
});

const may = (set: Set<string>, user: { id: string } | null, id: string) => set.has(`${user?.id ?? 'anonymous'}:${id}`);

vi.mock('$lib/platform/db.server', () => ({ db: { begin: async (run: (sql: unknown) => unknown) => run({}) } }));
vi.mock('$lib/features/nodes/server', () => ({
  getNodeType: async (id: string) => fake.types.get(id) ?? null,
  resolveShareLink: async () => null,
}));
vi.mock('$lib/features/pages/server', () => ({
  getPage: async (id: string) => fake.pages.get(id) ?? null,
  userCanWritePage: async (user: { id: string } | null, page: { id: string }) => may(fake.writers, user, page.id),
}));
vi.mock('$lib/features/collections/server', () => ({
  getCollection: async (id: string) => fake.collections.get(id) ?? null,
  getCollectionSourceRef: async (id: string) => fake.refs.get(id) ?? {},
  setCollectionSourceRef: async (id: string, ref: Record<string, unknown>) => (fake.refs.set(id, ref), true),
  userCanReadCollection: async (user: { id: string } | null, row: { id: string }) => may(fake.readers, user, row.id),
  userCanWriteCollection: async (user: { id: string } | null, row: { id: string }) => may(fake.writers, user, row.id),
  createCollection: async (opts: Record<string, unknown>) => {
    fake.created.push(opts);
    fake.types.set(MADE, 'collection');
    fake.collections.set(MADE, { ...row(MADE, 'acme'), visibility: opts.visibility ?? null });
    fake.readers.add(`${(opts.user as { id: string }).id}:${MADE}`);
    return { id: MADE, slug: 'made' };
  },
  listCollectionsForUser: async () => [],
  memberDocumentsOf: async () => [],
  addMember: async () => {},
  findMemberDocument: async () => null,
  lockCollection: async () => true,
}));
vi.mock('$lib/features/documents/server', () => ({
  getDocument: async (id: string) => fake.documents.get(id) ?? null,
  getDocumentSourceRef: async (id: string) => fake.refs.get(id) ?? {},
  setDocumentSourceRef: async (id: string, ref: Record<string, unknown>) => (fake.refs.set(id, ref), true),
  userCanReadDocument: async (user: { id: string } | null, row: { id: string }) => may(fake.readers, user, row.id),
  userCanWriteDocument: async (user: { id: string } | null, row: { id: string }) => may(fake.writers, user, row.id),
  createPluginDocument: async () => ({ id: 'never', slug: 'never' }),
  findPluginDocument: async () => null,
  listPluginDocumentsForUser: async () => [],
  lockPluginDocument: async () => {},
}));
vi.mock('$lib/plugins', () => ({
  pluginManifest: (id: string) => (id === 'acme' ? { id: 'acme', label: () => 'Acme', connections: null } : null),
}));
vi.mock('./settings.server', () => ({
  getPluginSettings: async () => ({ enabled: fake.origin !== null, values: {} }),
  pluginOrigin: async () => fake.origin,
}));
vi.mock('./secrets.server', () => ({
  sealedSecretOf: async (id: string) => fake.sealed.get(id) ?? null,
  storeSealedSecret: async (_sql: unknown, id: string, _plugin: string, sealed: string) => void fake.sealed.set(id, sealed),
}));
vi.mock('./sourceSearch.server', () => ({ indexSourceSearch: async () => {} }));
vi.mock('./connections.server', () => ({
  connectionOf: async () => null,
  markRevoked: async () => false,
  openCredential: () => null,
  touchConnection: async () => {},
}));

import { createPluginHost } from './host.server';
import { secretBox } from '$lib/platform/secretBox.server';
import { bindSecret, openBoundSecret } from './boundSecret';
import type { Logger } from '$lib/platform/logger.server';

const COL = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const PAGE = '33333333-3333-4333-8333-333333333333';
const DOC = '44444444-4444-4444-8444-444444444444';
const MADE = '55555555-5555-4555-8555-555555555555';

function row(id: string, plugin: string) {
  return { id, plugin, title: id, slug: id.slice(0, 8), namespace_id: 'ns', namespace_slug: null, visibility: null, namespace_access_level: 'internal', locale: 'en' };
}

const quiet: Logger = (() => {
  const log = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {}, child: () => log };
  return log as unknown as Logger;
})();

const alice = { id: 'alice', role: 'editor' } as never;
const bob = { id: 'bob', role: 'viewer' } as never;
const host = (user: unknown, shareLink?: { token: string; nodeId: string }) => createPluginHost('acme', { user: user as never, locale: 'en', log: quiet, ...(shareLink ? { shareLink } : {}) });

beforeEach(() => {
  for (const map of [fake.types, fake.collections, fake.documents, fake.pages, fake.sealed, fake.refs]) map.clear();
  fake.readers.clear();
  fake.writers.clear();
  fake.created.length = 0;
  fake.origin = 'https://cloud.example';
  fake.types.set(COL, 'collection').set(OTHER, 'collection').set(PAGE, 'page').set(DOC, 'document');
  fake.collections.set(COL, row(COL, 'acme')).set(OTHER, row(OTHER, 'other'));
  fake.documents.set(DOC, { ...row(DOC, 'acme'), source: 'plugin', filename: 'a.pdf', mime: 'application/pdf', size: 1 });
  fake.pages.set(PAGE, { id: PAGE, namespace_id: 'ns', locale: 'en', visibility: 'restricted' });
  for (const id of [COL, OTHER, DOC]) fake.readers.add(`alice:${id}`);
  for (const id of [COL, OTHER, DOC, PAGE]) fake.writers.add(`alice:${id}`);
  fake.readers.add(`bob:${COL}`);
});

describe('the plugin host', () => {
  it("reads only its own plugin's nodes, for a viewer who may read them", async () => {
    expect((await host(alice).nodes.read(COL))?.id).toBe(COL);
    expect((await host(alice).nodes.read(DOC))?.id).toBe(DOC);
    expect(await host(alice).nodes.read(OTHER)).toBeNull();
    expect(await host(alice).nodes.read(PAGE)).toBeNull();
    expect(await host(alice).nodes.read('not-an-id')).toBeNull();
    expect(await host(null).nodes.read(COL)).toBeNull();
    expect(await host(bob).nodes.read(DOC)).toBeNull();
  });

  it("grants a share link's viewer the node it grants, and nothing else", async () => {
    const visitor = host(null, { token: 'link', nodeId: COL });
    expect((await visitor.nodes.read(COL))?.id).toBe(COL);
    expect(await visitor.nodes.read(DOC)).toBeNull();
    expect(await visitor.nodes.canWrite(COL)).toBe(false);
  });

  it('writes for a writer, and observes for a reader', async () => {
    expect(await host(alice).nodes.canWrite(COL)).toBe(true);
    expect(await host(bob).nodes.canWrite(COL)).toBe(false);
    expect(await host(null).nodes.canWrite(COL)).toBe(false);
    expect(await host(bob).nodes.rebind(COL, { ref: { path: 'x' } })).toBe(false);
    expect(await host(alice).nodes.rebind(COL, { ref: { path: 'x' } })).toBe(true);
    expect(await host(bob).nodes.observe(COL, { status: 'ok' })).toBe(true);
    expect(await host(bob).nodes.observe(DOC, { status: 'ok' })).toBe(false);
  });

  const opened = (id: string, binding = { node: id, origin: 'https://cloud.example' }) => openBoundSecret(secretBox().open('node-source-secret', fake.sealed.get(id)!)!, binding);

  it('opens a credential only for a reader, only as the node it was sealed for, and only at the address it was made for', async () => {
    fake.sealed.set(COL, secretBox().seal('node-source-secret', bindSecret('S', { node: COL, origin: 'https://cloud.example' })));
    expect(await host(alice).secrets.get(COL)).toBe('S');
    expect(await host(null).secrets.get(COL)).toBeNull();
    fake.sealed.set(DOC, fake.sealed.get(COL)!);
    expect(await host(alice).secrets.get(DOC)).toBeNull();
    fake.origin = 'https://elsewhere.example';
    expect(await host(alice).secrets.get(COL)).toBeNull();
    fake.origin = null;
    expect(await host(alice).secrets.get(COL)).toBeNull();
  });

  it('opens a credential sealed in any other shape as nothing, and leaves it as it is', async () => {
    for (const plaintext of ['legacy', JSON.stringify({ v: 1, origin: 'https://cloud.example', value: 'S' })]) {
      const sealed = secretBox().seal('node-source-secret', plaintext);
      fake.sealed.set(COL, sealed);
      expect(await host(alice).secrets.get(COL), plaintext).toBeNull();
      expect(fake.sealed.get(COL)).toBe(sealed);
    }
  });

  it('seals a credential only for a writer, for that node at the address in effect', async () => {
    expect(await host(bob).secrets.set(COL, 'N')).toBe(false);
    expect(await host(alice).secrets.set(COL, 'N')).toBe(true);
    expect(opened(COL)).toBe('N');
    expect(opened(COL, { node: DOC, origin: 'https://cloud.example' })).toBeNull();
    fake.origin = null;
    expect(await host(alice).secrets.set(COL, 'M')).toBe(false);
  });

  it('makes a node only beside a page its viewer writes, and no wider than that page', async () => {
    expect(await host(alice).nodes.mayCreateBeside('not-an-id')).toBe('not-found');
    expect(await host(null).nodes.mayCreateBeside(PAGE)).toBe('forbidden');
    expect(await host(bob).nodes.mayCreateBeside(PAGE)).toBe('forbidden');
    expect(await host(alice).nodes.mayCreateBeside(PAGE)).toBe('ok');
    expect(await host(bob).nodes.createCollection({ title: 'T', besidePageId: PAGE, ref: {}, secret: 's' })).toEqual({ ok: false, reason: 'forbidden' });
    const made = await host(alice).nodes.createCollection({ title: 'T', besidePageId: PAGE, ref: {}, secret: 's' });
    expect(made.ok).toBe(true);
    expect(fake.created[0]).toMatchObject({ visibility: 'restricted', plugin: 'acme' });
    expect(opened(MADE)).toBe('s');
  });

  it('redirects only to a path on this app, never cached, with no referrer', () => {
    const respond = host(alice).respond;
    for (const path of ['//evil.example/x', 'https://evil.example', '/\\evil.example', 'relative']) expect(() => respond.redirect(path), path).toThrow();
    const ok = respond.redirect('/api/plugins/acme/file/x');
    expect(ok.status).toBe(302);
    expect(ok.headers.get('referrer-policy')).toBe('no-referrer');
    expect(ok.headers.get('cache-control')).toBe('private, no-store');
  });

  it('has no network while the plugin has no address', async () => {
    expect(await host(alice).upstream()).not.toBeNull();
    fake.origin = null;
    expect(await host(alice).upstream()).toBeNull();
  });
});
