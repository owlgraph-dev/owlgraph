// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import type { PluginHost, PluginRoute, PluginServer } from '$lib/plugins/api';
import { dispatchPluginRequest, matchRoute, splitPath, MAX_BODY_BYTES, type DispatchDeps, type DispatchRequest } from './dispatch.server';

// A fake plugin whose routes echo what they were called with.
const ran: string[] = [];
const route = (method: PluginRoute['method'], path: string, access: PluginRoute['access']): PluginRoute => ({
  method,
  path,
  access,
  async handle(request) {
    ran.push(`${method} ${path}`);
    return new Response(JSON.stringify({ params: request.params, body: request.body ?? null, q: request.query.get('q') }), {
      headers: { 'content-type': 'application/json' },
    });
  },
});
// A route that has the service check a password: right or not.
const connect: PluginRoute = {
  method: 'POST',
  path: 'connect',
  access: 'signed-in',
  checksCredential: true,
  async handle(request) {
    ran.push('POST connect');
    return new Response(null, { status: (request.body as { password?: string } | undefined)?.password === 'right' ? 201 : 400 });
  },
};
const acme: PluginServer = {
  id: 'acme',
  routes: [
    connect,
    route('GET', 'listing', 'public'),
    route('GET', 'file/:token', 'public'),
    route('POST', 'documents', 'signed-in'),
    route('POST', 'documents/:id/check', 'signed-in'),
    route('DELETE', 'documents/:id', 'signed-in'),
    route('PUT', 'probe', 'manage'),
  ],
};

function dispatch(req: Partial<DispatchRequest> = {}, over: Partial<DispatchDeps> = {}) {
  const refusals: string[] = [];
  const deps: DispatchDeps = {
    server: (id) => (id === 'acme' ? acme : null),
    signedIn: false,
    canManage: false,
    rateLimit: () => ({ allowed: true, retryAfterMs: 0 }),
    credentialBudget: () => ({ allowed: true, retryAfterMs: 0 }),
    credentialFailed: () => {},
    host: () => ({}) as PluginHost,
    refused(kind) {
      refusals.push(kind);
      return new Response(null, { status: kind === 'rate' || kind === 'credential' ? 429 : kind === 'manage' ? 403 : 401 });
    },
    ...over,
  };
  const request: DispatchRequest = {
    method: 'GET',
    pluginId: 'acme',
    rawPath: 'listing',
    query: new URLSearchParams(),
    contentType: null,
    text: async () => '',
    ...req,
  };
  return { response: dispatchPluginRequest(request, deps), refusals };
}

const json = async (r: Promise<Response>) => (await r).json();
const status = async (r: Promise<Response>) => (await r).status;
const write = (method: string, rawPath: string, contentType: string | null, body: string | null): Partial<DispatchRequest> => ({
  method,
  rawPath,
  contentType,
  text: async (limit) => (body !== null && Buffer.byteLength(body) <= limit ? body : null),
});

describe('the plugin route dispatcher', () => {
  it('runs a public route for anyone, with its query', async () => {
    expect(await json(dispatch({ query: new URLSearchParams('q=x') }).response)).toEqual({ params: {}, body: null, q: 'x' });
  });

  it('answers 404 alike for an unknown plugin, path or method', async () => {
    expect(await status(dispatch({ pluginId: 'other' }).response)).toBe(404);
    expect(await status(dispatch({ rawPath: 'nowhere' }).response)).toBe(404);
    expect(await status(dispatch({ rawPath: 'listing/more' }).response)).toBe(404);
    expect(await status(dispatch({ rawPath: '' }).response)).toBe(404);
    expect(await status(dispatch({ method: 'POST', contentType: 'application/json' }).response)).toBe(404);
  });

  it('decodes a parameter, and refuses one that smuggles a slash or is empty', async () => {
    expect((await json(dispatch({ rawPath: 'file/a%20b.c' }).response)).params).toEqual({ token: 'a b.c' });
    for (const rawPath of ['file/a%2Fb', 'file/a%5Cb', 'file//', 'file/%E0%A4%A', 'file/a%00b', 'listing/']) {
      expect(await status(dispatch({ rawPath }).response), rawPath).toBe(404);
    }
  });

  it('answers HEAD with the GET route', async () => {
    expect(await status(dispatch({ method: 'HEAD' }).response)).toBe(200);
  });

  it('holds a route to its declared access', async () => {
    const post = write('POST', 'documents', 'application/json', '{}');
    expect(await status(dispatch(post).response)).toBe(401);
    expect(await status(dispatch(post, { signedIn: true }).response)).toBe(200);
    const probe = write('PUT', 'probe', 'application/json', '{}');
    expect(await status(dispatch(probe).response)).toBe(401);
    expect(await status(dispatch(probe, { signedIn: true }).response)).toBe(403);
    expect(await status(dispatch(probe, { signedIn: true, canManage: true }).response)).toBe(200);
  });

  it('takes a write as JSON or not at all', async () => {
    const signedIn = { signedIn: true };
    expect(await status(dispatch(write('POST', 'documents', 'application/x-www-form-urlencoded', 'a=1'), signedIn).response)).toBe(415);
    expect(await status(dispatch(write('POST', 'documents', 'text/plain', '{}'), signedIn).response)).toBe(415);
    expect(await status(dispatch(write('POST', 'documents', null, '{}'), signedIn).response)).toBe(415);
    expect(await status(dispatch(write('POST', 'documents', 'application/json', '{nope'), signedIn).response)).toBe(400);
    expect(await status(dispatch(write('POST', 'documents', 'application/json', `"${'x'.repeat(MAX_BODY_BYTES)}"`), signedIn).response)).toBe(413);
    const ok = await json(dispatch(write('POST', 'documents/d1/check', 'application/json; charset=utf-8', '{"path":"a/b"}'), signedIn).response);
    expect(ok).toEqual({ params: { id: 'd1' }, body: { path: 'a/b' }, q: null });
  });

  it('takes a DELETE without a body, but no form', async () => {
    const signedIn = { signedIn: true };
    expect(await status(dispatch(write('DELETE', 'documents/d1', null, ''), signedIn).response)).toBe(200);
    expect(await status(dispatch(write('DELETE', 'documents/d1', 'multipart/form-data; boundary=x', 'x'), signedIn).response)).toBe(415);
  });

  it('counts every request against the caller, an unknown one too, and runs nothing past the limit', async () => {
    ran.length = 0;
    let counted = 0;
    const limited = { rateLimit: () => ({ allowed: ++counted <= 1, retryAfterMs: 1000 }) };
    expect(await status(dispatch({ rawPath: 'nowhere' }, limited).response)).toBe(404);
    const { response, refusals } = dispatch({}, limited);
    expect(await status(response)).toBe(429);
    expect(refusals).toEqual(['rate']);
    expect(ran).toEqual([]);
  });

  it('spends a failed credential check on a 4xx answer, none on a success, and runs nothing once they are spent', async () => {
    let failures = 0;
    const budget = {
      signedIn: true,
      credentialBudget: () => ({ allowed: failures < 2, retryAfterMs: 5 }),
      credentialFailed: () => void failures++,
    };
    const attempt = (password: string) => write('POST', 'connect', 'application/json', JSON.stringify({ password }));
    expect(await status(dispatch(attempt('wrong'), budget).response)).toBe(400);
    expect(await status(dispatch(attempt('right'), budget).response)).toBe(201);
    expect(failures).toBe(1);
    expect(await status(dispatch(attempt('wrong'), budget).response)).toBe(400);
    ran.length = 0;
    const spent = dispatch(attempt('right'), budget);
    expect(await status(spent.response)).toBe(429);
    expect(spent.refusals).toEqual(['credential']);
    expect(ran).toEqual([]);
    // A route that checks nothing never asks the budget.
    expect(await status(dispatch(write('POST', 'documents', 'application/json', '{}'), budget).response)).toBe(200);
  });
});

describe('route matching', () => {
  it('splits a raw path into decoded segments', () => {
    expect(splitPath('documents/abc/check')).toEqual(['documents', 'abc', 'check']);
    expect(splitPath('a%C3%A4')).toEqual(['aä']);
    expect(splitPath('')).toBeNull();
    expect(splitPath('a//b')).toBeNull();
  });

  it('matches literal segments exactly and binds parameters', () => {
    const routes = acme.routes!;
    expect(matchRoute(routes, 'POST', ['documents', 'x', 'check'])?.params).toEqual({ id: 'x' });
    expect(matchRoute(routes, 'POST', ['documents', 'x', 'checks'])).toBeNull();
    expect(matchRoute(routes, 'GET', ['documents'])).toBeNull();
  });
});
