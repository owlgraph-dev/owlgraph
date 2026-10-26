// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { beforeEach, describe, expect, it, vi } from 'vitest';

// The store is faked as a table of rows by person; whether a sealed credential
// opens for its row is connections.server.test.ts's to show.

const fake = vi.hoisted(() => ({
  /** Each person's connection row, by user id. */
  rows: new Map<string, Record<string, unknown>>(),
  /** Whose rows the host looked up. */
  lookups: [] as string[],
  /** The connection ids markRevoked was asked to turn. */
  revoked: [] as string[],
  origin: 'https://cloud.example' as string | null,
}));

vi.mock('$lib/platform/db.server', () => ({ db: { begin: async (run: (sql: unknown) => unknown) => run({}) } }));
vi.mock('$lib/features/nodes/server', () => ({ getNodeType: async () => null, resolveShareLink: async () => null }));
vi.mock('$lib/features/pages/server', () => ({ getPage: async () => null, userCanWritePage: async () => false }));
vi.mock('$lib/features/collections/server', () => ({}));
vi.mock('$lib/features/documents/server', () => ({}));
vi.mock('$lib/plugins', () => ({
  pluginManifest: (id: string) => (id === 'acme' ? { id: 'acme', label: () => 'Acme', connections: { intro: () => 'Connect Acme' } } : null),
}));
vi.mock('./settings.server', () => ({
  getPluginSettings: async () => ({ enabled: fake.origin !== null, values: {} }),
  pluginOrigin: async () => fake.origin,
}));
vi.mock('./secrets.server', () => ({ sealedSecretOf: async () => null, storeSealedSecret: async () => {} }));
vi.mock('./sourceSearch.server', () => ({ indexSourceSearch: async () => {} }));
vi.mock('./connections.server', () => ({
  connectionOf: async (userId: string, plugin: string) => {
    fake.lookups.push(userId);
    const row = fake.rows.get(userId);
    return row && row.plugin === plugin ? { ...row } : null;
  },
  markRevoked: async (id: string) => {
    fake.revoked.push(id);
    const row = [...fake.rows.values()].find((r) => r.id === id && r.status === 'active');
    if (!row) return null;
    row.status = 'revoked';
    return { userId: row.user_id as string };
  },
  // The row's own credential, for a seal that opens for it.
  openCredential: (row: Record<string, unknown>) =>
    row.sealed_credential === 'opens' ? { kind: 'app_password', login: row.account_id as string, secret: `app-password-of-${row.user_id as string}` } : null,
  touchConnection: async () => {},
}));

import { createPluginHost } from './host.server';
import type { Logger } from '$lib/platform/logger.server';

const quiet: Logger = (() => {
  const log = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {}, child: () => log };
  return log as unknown as Logger;
})();

const alice = { id: 'alice', role: 'editor' } as never;
const bob = { id: 'bob', role: 'editor' } as never;
const LINKED = '11111111-1111-4111-8111-111111111111';

const host = (user: unknown, shareLink?: { token: string; nodeId: string }) =>
  createPluginHost('acme', { user: user as never, locale: 'en', log: quiet, ...(shareLink ? { shareLink } : {}) });

function connection(userId: string, extra: Record<string, unknown> = {}) {
  return {
    id: `conn-${userId}`,
    user_id: userId,
    plugin: 'acme',
    origin: 'https://cloud.example',
    credential_kind: 'app_password',
    sealed_credential: 'opens',
    account_id: `${userId}-at-acme`,
    account_label: `${userId} at Acme`,
    status: 'active',
    ...extra,
  };
}

beforeEach(() => {
  fake.rows.clear();
  fake.lookups.length = 0;
  fake.revoked.length = 0;
  fake.origin = 'https://cloud.example';
  fake.rows.set('alice', connection('alice')).set('bob', connection('bob'));
});

describe("the viewer's connection, as the host opens it", () => {
  it('is the viewer’s own: each person’s for them, looked up by their id alone, and none for an anonymous viewer', async () => {
    expect(await host(alice).connection.open()).toEqual({
      id: 'conn-alice',
      accountId: 'alice-at-acme',
      accountLabel: 'alice at Acme',
      credential: { kind: 'app_password', login: 'alice-at-acme', secret: 'app-password-of-alice' },
    });
    expect((await host(bob).connection.open())?.credential.secret).toBe('app-password-of-bob');
    expect(fake.lookups).toEqual(['alice', 'bob']);
    const anonymous = host(null);
    expect(await anonymous.connection.open()).toBeNull();
    expect(await anonymous.connection.status()).toBe('none');
    expect(fake.lookups).toEqual(['alice', 'bob']);
  });

  it('is never opened for a request through a share link, though its viewer is signed in and connected', async () => {
    const visitor = host(alice, { token: 'a-share-link', nodeId: LINKED });
    expect(await visitor.connection.open()).toBeNull();
    expect(await visitor.connection.status()).toBe('none');
    expect(fake.lookups).toEqual([]);
  });

  it('is never opened once it was made against another address than the plugin’s now — its status is renew — nor while the plugin has none', async () => {
    fake.rows.set('alice', connection('alice', { origin: 'https://old-cloud.example' }));
    const moved = host(alice);
    expect(await moved.connection.open()).toBeNull();
    expect(await moved.connection.status()).toBe('renew');

    fake.rows.set('alice', connection('alice'));
    fake.origin = null;
    expect(await host(alice).connection.open()).toBeNull();
    fake.origin = 'https://cloud.example';
    expect((await host(alice).connection.open())?.id).toBe('conn-alice');
  });

  it('is not opened while revoked, nor when its seal does not open for its row', async () => {
    fake.rows.set('alice', connection('alice', { status: 'revoked' }));
    const revoked = host(alice);
    expect(await revoked.connection.open()).toBeNull();
    expect(await revoked.connection.status()).toBe('renew');
    fake.rows.set('bob', connection('bob', { sealed_credential: 'moved-from-another-row' }));
    expect(await host(bob).connection.open()).toBeNull();
  });
});

describe('refused()', () => {
  it('marks revoked the connection this request read with — and the request reads with it no more', async () => {
    const request = host(alice);
    const opened = await request.connection.open();
    expect(opened?.id).toBe('conn-alice');
    await request.connection.refused('conn-alice');
    expect(fake.revoked).toEqual(['conn-alice']);
    expect(fake.rows.get('alice')?.status).toBe('revoked');
    expect(await request.connection.open()).toBeNull();
    expect(await request.connection.status()).toBe('renew');
    // Bob's is his own.
    expect(fake.rows.get('bob')?.status).toBe('active');
  });

  it("never marks another person's connection, nor one this request did not read with, nor anything for an anonymous viewer or a share link's", async () => {
    await host(alice).connection.refused('conn-bob');
    await host(null).connection.refused('conn-alice');
    await host(bob, { token: 'a-share-link', nodeId: LINKED }).connection.refused('conn-bob');

    // Alice connected anew elsewhere meanwhile: this request read with her old connection, never the new one.
    const request = host(alice);
    await request.connection.open();
    fake.rows.set('alice', connection('alice', { id: 'conn-alice-anew' }));
    await request.connection.refused('conn-alice-anew');

    expect(fake.revoked).toEqual([]);
    expect([fake.rows.get('alice')?.status, fake.rows.get('bob')?.status]).toEqual(['active', 'active']);
  });
});
