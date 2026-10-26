// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({
  origin: 'https://cloud.example' as string | null,
  rows: [] as { id: string; user_id: string; origin: string; secret: string }[],
  revoked: [] as string[],
  revokeThrows: false,
}));

vi.mock('$lib/plugins', () => ({
  PLUGINS_WITH_CONNECTIONS: ['acme'],
  pluginManifest: (id: string) => (id === 'acme' ? { id: 'acme', connections: {} } : null),
}));
vi.mock('$lib/plugins/server', () => ({
  pluginServer: (id: string) =>
    id === 'acme'
      ? {
          connections: {
            revoke: async (_client: unknown, credential: { secret: string }) => {
              if (fake.revokeThrows) throw new Error(`refused ${credential.secret}`);
              fake.revoked.push(credential.secret);
              return true;
            },
          },
        }
      : null,
}));
vi.mock('./settings.server', () => ({ pluginOrigin: async () => fake.origin }));
vi.mock('./connections.server', () => ({
  connectionStore: {},
  deleteConnections: async (_plugin: string, opts: { keepOrigin?: string } = {}) => {
    const removed = fake.rows.filter((row) => opts.keepOrigin === undefined || row.origin !== opts.keepOrigin);
    fake.rows = fake.rows.filter((row) => !removed.includes(row));
    return removed;
  },
  openCredential: (row: { secret: string }) => ({ kind: 'app_password', login: 'x', secret: row.secret }),
}));
vi.mock('$lib/platform/upstream.server', () => ({ READ_METHODS: ['GET'], upstreamClient: () => ({}) }));

import { removeConnections } from './connect.server';
import type { Logger } from '$lib/platform/logger.server';

const lines: Record<string, unknown>[] = [];
const log = (() => {
  const record = (fields: Record<string, unknown>, event: string) => void lines.push({ ...fields, event });
  const l = { info: record, warn: record, error: record, debug: record, child: () => l };
  return l as unknown as Logger;
})();

const row = (id: string, origin = 'https://cloud.example') => ({ id, user_id: `user-${id}`, origin, secret: `secret-${id}` });
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  fake.origin = 'https://cloud.example';
  fake.rows = [row('a'), row('b'), row('moved', 'https://old.example')];
  fake.revoked = [];
  fake.revokeThrows = false;
  lines.length = 0;
});

describe('removing everyone’s connections', () => {
  it('asks the service to forget each credential made for its address, and none made for another', async () => {
    expect(await removeConnections('acme', { reason: 'admin', actorId: 'admin', log })).toEqual({ removed: 3, notAsked: 1 });
    await vi.waitFor(() => expect(fake.revoked.sort()).toEqual(['secret-a', 'secret-b']));
    expect(fake.rows).toEqual([]);
  });

  it('removes them all while the integration is off, says none could be asked, and sends nothing', async () => {
    fake.origin = null;
    expect(await removeConnections('acme', { reason: 'admin', actorId: 'admin', log })).toEqual({ removed: 3, notAsked: 3 });
    await settle();
    expect(fake.revoked).toEqual([]);
    expect(fake.rows).toEqual([]);
  });

  it('keeps them on a change of address while the integration is off: nothing has replaced their address yet', async () => {
    fake.origin = null;
    expect(await removeConnections('acme', { reason: 'origin_changed', actorId: 'admin', log })).toEqual({ removed: 0, notAsked: 0 });
    expect(fake.rows).toHaveLength(3);
  });

  it('logs a removal the service refused to forget by its class, never by what it said', async () => {
    fake.revokeThrows = true;
    await removeConnections('acme', { reason: 'admin', actorId: 'admin', log });
    await vi.waitFor(() => expect(lines.filter((l) => l.event === 'integration.connection_removed')).toHaveLength(3));
    expect(lines.filter((l) => l.event === 'integration.connection_removed').every((l) => l.remoteRevoked === false)).toBe(true);
    expect(JSON.stringify(lines)).not.toContain('secret-');
  });

  it('removes nothing for a plugin without connections', async () => {
    expect(await removeConnections('nobody', { reason: 'admin', actorId: 'admin', log })).toEqual({ removed: 0, notAsked: 0 });
    expect(fake.rows).toHaveLength(3);
  });
});
