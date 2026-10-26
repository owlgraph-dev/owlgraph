// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, it, vi } from 'vitest';

const ran = vi.hoisted(() => ({ calls: [] as string[] }));
vi.mock('$lib/features/pluginHost/server', () => ({
  flowDepsFor: (plugin: string) => (plugin === 'acme' ? { plugin: 'acme' } : null),
  beginConnect: async () => (ran.calls.push('begin'), { ok: true, approveUrl: 'https://cloud.example/login' }),
  pollConnect: async () => (ran.calls.push('poll'), { state: 'pending' }),
  recheck: async () => (ran.calls.push('check'), 'active'),
  cancelConnect: async () => void ran.calls.push('cancel'),
  disconnect: async () => (ran.calls.push('disconnect'), { removed: true, remoteRevoked: true }),
}));

import { begin, cancel } from './api.connections.server';
import type { Logger } from '$lib/platform/logger.server';

const log = (() => {
  const l = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {}, child: () => l };
  return l as unknown as Logger;
})();

function event(opts: { user?: string | null; plugin?: string; method?: string; type?: string | null }) {
  const headers: Record<string, string> = {};
  if (opts.type !== null) headers['content-type'] = opts.type ?? 'application/json';
  const user = opts.user === undefined ? 'alice' : opts.user;
  return {
    params: { plugin: opts.plugin ?? 'acme' },
    url: new URL('https://wiki.example/api/connections/acme'),
    request: new Request('https://wiki.example/api/connections/acme', { method: opts.method ?? 'POST', headers, body: opts.method === 'DELETE' ? undefined : '{}' }),
    locals: { user: user ? { id: user, role: 'editor' } : null, sessionId: user ? `session-${user}` : null, log },
  } as never;
}

describe('a person’s connection routes', () => {
  it('ask for a session first', async () => {
    ran.calls.length = 0;
    expect((await begin(event({ user: null }))).status).toBe(401);
    expect(ran.calls).toEqual([]);
  });

  it('take a write as JSON only — a form posted from another site is refused — and a DELETE without a body', async () => {
    ran.calls.length = 0;
    for (const type of ['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data', null]) {
      expect((await begin(event({ user: 'bob', type }))).status, String(type)).toBe(415);
    }
    expect(ran.calls).toEqual([]);
    expect((await cancel(event({ user: 'bob', method: 'DELETE', type: null }))).status).toBe(200);
    expect((await begin(event({ user: 'bob' }))).status).toBe(200);
    expect(ran.calls).toEqual(['cancel', 'begin']);
  });

  it('answer a plugin that offers no connections as not found', async () => {
    expect((await begin(event({ user: 'carol', plugin: 'nobody' }))).status).toBe(404);
  });

  it("refuse a person past their budget, and nobody else's", async () => {
    let last = 0;
    for (let i = 0; i < 121; i++) last = (await begin(event({ user: 'dave' }))).status;
    expect(last).toBe(429);
    expect((await begin(event({ user: 'erin' }))).status).toBe(200);
  });
});
