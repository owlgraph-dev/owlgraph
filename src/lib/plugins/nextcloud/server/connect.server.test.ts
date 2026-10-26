// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Against the mock server, through a real pinned client that may POST and DELETE.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { startMockNextcloud, type MockNextcloud } from '../e2e/mockNextcloud';
import { connectFlow } from './connect.server';
import { READ_METHODS, upstreamClient, type UpstreamClient } from '$lib/platform/upstream.server';
import type { PluginCredential } from '$lib/plugins/api';

let mock: MockNextcloud;
let client: UpstreamClient;
const NAME = 'owlgraph (wiki.example.org)';

beforeAll(async () => {
  mock = await startMockNextcloud({}, { alice: { loginName: 'alice@example.org', displayName: 'Alice Example', tree: { name: '', files: {} } } });
  client = upstreamClient(mock.origin, {}, { methods: [...READ_METHODS, 'POST', 'DELETE'] });
});

afterAll(() => mock.close());

beforeEach(() => {
  mock.mode = 'ok';
  mock.flowServer = null;
  mock.requests.length = 0;
});

const loginTokenOf = (approveUrl: string) => approveUrl.split('/').at(-1)!;

async function started() {
  const begun = await connectFlow.begin(client, { clientName: NAME });
  if (!begun.ok) throw new Error(`begin failed: ${begun.reason}`);
  return begun;
}

describe('Login Flow v2', () => {
  it('begins with the client name as the User-Agent, and hands back where to approve and the poll token', async () => {
    const begun = await started();
    expect(begun.approveUrl).toMatch(new RegExp(`^${mock.origin}/index.php/login/v2/flow/[A-Za-z0-9]+$`));
    expect(begun.handle).toMatch(/^[A-Za-z0-9]{128}$/);
    expect(begun.ttlSeconds).toBe(1200);
    expect(mock.requests).toEqual([expect.objectContaining({ method: 'POST', path: '/index.php/login/v2', userAgent: NAME })]);
  });

  it('polls the fixed path with the token in a form body: pending, then the credential once, then pending again', async () => {
    const begun = await started();
    expect(await connectFlow.poll(client, begun.handle)).toEqual({ state: 'pending' });
    const appPassword = mock.approve(loginTokenOf(begun.approveUrl), 'alice')!;
    expect(await connectFlow.poll(client, begun.handle)).toEqual({
      state: 'approved',
      server: mock.origin,
      credential: { kind: 'app_password', login: 'alice@example.org', secret: appPassword },
    });
    // Single-use: the flow is gone at the server.
    expect(await connectFlow.poll(client, begun.handle)).toEqual({ state: 'pending' });
    const polls = mock.requests.filter((r) => r.path === '/index.php/login/v2/poll');
    expect(polls).toHaveLength(3);
    for (const p of polls) expect(p).toMatchObject({ method: 'POST', authorization: null });
  });

  it('reads who the credential is, by the OCS user call — and a refused credential as unauthorized', async () => {
    const begun = await started();
    const secret = mock.approve(loginTokenOf(begun.approveUrl), 'alice')!;
    const credential: PluginCredential = { kind: 'app_password', login: 'alice@example.org', secret };
    expect(await connectFlow.verify(client, credential)).toEqual({ ok: true, accountId: 'alice', accountLabel: 'Alice Example' });
    expect(mock.requests.at(-1)).toMatchObject({ method: 'GET', path: '/ocs/v1.php/cloud/user', authUser: 'alice' });

    expect(await connectFlow.verify(client, { ...credential, secret: 'wrong' })).toEqual({ ok: false, reason: 'unauthorized' });
    mock.mode = 'error';
    expect(await connectFlow.verify(client, credential)).toEqual({ ok: false, reason: 'unreachable' });
  });

  it('has the server forget the app password, authenticated by itself — and says when it could not', async () => {
    const begun = await started();
    const secret = mock.approve(loginTokenOf(begun.approveUrl), 'alice')!;
    const credential: PluginCredential = { kind: 'app_password', login: 'alice@example.org', secret };
    mock.mode = 'error';
    expect(await connectFlow.revoke(client, credential)).toBe(false);
    expect(mock.appPasswords.has(secret)).toBe(true);
    mock.mode = 'ok';
    expect(await connectFlow.revoke(client, credential)).toBe(true);
    expect(mock.appPasswords.has(secret)).toBe(false);
    expect(mock.requests.at(-1)).toMatchObject({ method: 'DELETE', path: '/ocs/v2.php/core/apppassword', authUser: 'alice' });
    // Forgotten: the same credential is refused now.
    expect(await connectFlow.verify(client, credential)).toEqual({ ok: false, reason: 'unauthorized' });
  });

  it('reports a server that cannot begin, and an answer it cannot read, without passing the answer on', async () => {
    mock.mode = 'error';
    expect(await connectFlow.begin(client, { clientName: NAME })).toEqual({ ok: false, reason: 'unreachable' });
    mock.mode = 'down';
    expect(await connectFlow.begin(client, { clientName: NAME })).toEqual({ ok: false, reason: 'unreachable' });
    mock.mode = 'redirect';
    expect(await connectFlow.begin(client, { clientName: NAME })).toEqual({ ok: false, reason: 'unreachable' });
    mock.mode = 'error';
    expect(await connectFlow.poll(client, 'A'.repeat(128))).toEqual({ state: 'failed' });
  });

  it('reads a body cut short as a failure, never throwing the parser message that would quote it', async () => {
    const cut: UpstreamClient = {
      origin: 'https://cloud.example.org',
      fetch: async () => ({ kind: 'response', status: 200, headers: {}, body: Buffer.from('{"server":"https://cloud.example.org","loginName":"alice","appPassword":"Secret-123') }),
      stream: async () => ({ kind: 'failure', failure: 'unreachable' }),
    };
    expect(await connectFlow.poll(cut, 'A'.repeat(128))).toEqual({ state: 'failed' });
    expect(await connectFlow.begin(cut, { clientName: NAME })).toEqual({ ok: false, reason: 'refused' });
    expect(await connectFlow.verify(cut, { kind: 'app_password', login: 'alice', secret: 'Secret-123' })).toEqual({ ok: false, reason: 'unreachable' });
  });
});
