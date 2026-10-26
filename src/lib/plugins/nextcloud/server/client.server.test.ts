// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Against the mock server, through the real pinned client.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { startMockNextcloud, type MockNextcloud } from '../e2e/mockNextcloud';
import { fakeHost } from '../e2e/fakeHost';
import { propfind, streamFile, encodeSecret, decodeSecret, shareAccess, type ShareSecret } from './client.server';
import { checkServer } from './status.server';
import { upstreamClient } from '$lib/platform/upstream.server';

const OPEN = 'OpenShare123';
const LOCKED = 'LockedShare456';

let mock: MockNextcloud;
const open: ShareSecret = { token: OPEN, password: null };
const locked: ShareSecret = { token: LOCKED, password: 'geheim' };

beforeAll(async () => {
  process.env.INTEGRATIONS_ALLOW_HTTP_LOOPBACK = '1';
  mock = await startMockNextcloud({
    [OPEN]: {
      name: 'Projektunterlagen',
      files: {
        'Bericht.pdf': { content: '%PDF-1.4 report', mime: 'application/pdf', fileid: 101 },
        'Q3/Plan.md': { content: '# Plan', mime: 'text/markdown', fileid: 102 },
      },
      folders: ['Leer'],
    },
    [LOCKED]: { name: 'Intern', password: 'geheim', files: { 'a.txt': { content: 'hello', mime: 'text/plain', fileid: 201 } } },
  });
});

afterAll(() => mock.close());

beforeEach(() => {
  mock.mode = 'ok';
  mock.requests.length = 0;
  mock.shares.get(OPEN)!.revoked = false;
});

const host = () => fakeHost({ origin: mock.origin });

describe('requests to a share', () => {
  it("list a folder: the folder first, then what is in it — marked as an XHR, with no credential an open share doesn't need", async () => {
    const result = await propfind(host(), shareAccess(open), '', 1, 'test');
    expect(result.ok && result.entries.map((e) => [e.path, e.folder])).toEqual([
      ['', true],
      ['Bericht.pdf', false],
      ['Leer', true],
      ['Q3', true],
    ]);
    expect(mock.requests[0]).toMatchObject({ method: 'PROPFIND', depth: '1', requestedWith: 'XMLHttpRequest', authorization: null });
    expect(mock.requests[0].path).toBe(`/public.php/dav/files/${OPEN}/`);
  });

  it("send a locked share's password as the anonymous user's, and read a refusal as unauthorized", async () => {
    expect((await propfind(host(), shareAccess(locked), '', 1, 'test')).ok).toBe(true);
    expect(mock.requests[0].authorization).toBe(`Basic ${Buffer.from('anonymous:geheim').toString('base64')}`);
    const wrong = await propfind(host(), shareAccess({ ...locked, password: 'falsch' }), '', 1, 'test');
    expect(wrong).toEqual({ ok: false, problem: 'unauthorized' });
    expect(await propfind(host(), shareAccess({ ...locked, password: null }), '', 1, 'test')).toEqual({ ok: false, problem: 'unauthorized' });
  });

  it('tell a revoked share from a path that is gone', async () => {
    expect(await propfind(host(), shareAccess(open), 'Nope.pdf', 0, 'test')).toEqual({ ok: false, problem: 'notFound' });
    mock.shares.get(OPEN)!.revoked = true;
    expect(await propfind(host(), shareAccess(open), 'Bericht.pdf', 0, 'test')).toEqual({ ok: false, problem: 'revoked' });
    expect(await propfind(host(), shareAccess(open), '', 1, 'test')).toEqual({ ok: false, problem: 'revoked' });
  });

  it('read a server that fails, redirects or drops the connection as unreachable — and log it without the token', async () => {
    const h = host();
    for (const mode of ['error', 'redirect', 'down'] as const) {
      mock.mode = mode;
      expect(await propfind(h, shareAccess(open), '', 1, `test:${mode}`), mode).toEqual({ ok: false, problem: 'unreachable' });
    }
    expect(h.logs.upstreamFailed.map((l) => l.failure)).toEqual(['status', 'redirect', 'unreachable']);
    expect(JSON.stringify(h.logs)).not.toContain(OPEN);
    // A redirect is an outcome, never a hop: nothing went anywhere but the mock.
    expect(mock.requests.every((r) => r.path.startsWith('/public.php/dav/files/'))).toBe(true);
  });

  it('ask nothing while the integration is off or has no address', async () => {
    expect(await propfind(fakeHost({ origin: mock.origin, enabled: false }), shareAccess(open), '', 1, 'test')).toEqual({ ok: false, problem: 'disabled' });
    expect(await propfind(fakeHost({ origin: null }), shareAccess(open), '', 1, 'test')).toEqual({ ok: false, problem: 'unconfigured' });
    expect(mock.requests).toHaveLength(0);
  });

  it("stream a file's bytes", async () => {
    const file = await streamFile(host(), shareAccess(open), 'Q3/Plan.md', 'test');
    expect(file.ok).toBe(true);
    if (file.ok) {
      expect(await new Response(file.body).text()).toBe('# Plan');
      expect(file.size).toBe(6);
    }
    expect(await streamFile(host(), shareAccess(open), 'Q3/Nope.md', 'test')).toEqual({ ok: false, problem: 'notFound' });
  });
});

describe("a share's credential", () => {
  it('round-trips through its sealed form, and nothing else passes for one', () => {
    expect(decodeSecret(encodeSecret(locked))).toEqual(locked);
    expect(decodeSecret(encodeSecret(open))).toEqual(open);
    for (const text of [null, '', 'x', '{}', JSON.stringify({ token: '../x' }), JSON.stringify({ token: 'ab' })]) expect(decodeSecret(text), String(text)).toBeNull();
  });
});

describe('the settings probe', () => {
  it('names the version that answers, and refuses one before 29 or a server that is not Nextcloud', async () => {
    expect(await checkServer(upstreamClient(mock.origin))).toEqual({ ok: true, message: 'Nextcloud 29.0.3 answers at this address.' });
    mock.version = '28.0.9.1';
    expect((await checkServer(upstreamClient(mock.origin))).ok).toBe(false);
    mock.version = '29.0.3.2';
    mock.mode = 'error';
    expect(await checkServer(upstreamClient(mock.origin))).toEqual({ ok: false, message: 'Something answers at this address, but not Nextcloud.' });
    mock.mode = 'redirect';
    expect((await checkServer(upstreamClient(mock.origin))).message).toMatch(/redirects/);
    mock.mode = 'down';
    expect(await checkServer(upstreamClient(mock.origin))).toEqual({ ok: false, message: 'Nothing answers at this address.' });
  });
});
