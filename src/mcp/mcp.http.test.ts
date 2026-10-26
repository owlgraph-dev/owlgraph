// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { upsertPropertyDefinition } from '$lib/features/semantic/server';

// The express app on a port of this file's own. Behind a proxy the client's
// address is X-Forwarded-For's, so each test speaks from addresses of its own
// and one limit's bucket never fills another's.

const seed = inject('seed');
let server: Server;
let url: string;

beforeAll(async () => {
  process.env.ADDRESS_HEADER = 'x-forwarded-for';
  const { app } = await import('./server');
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`;
});

afterAll(() => new Promise((resolve) => server.close(resolve)));

const ping = (from: string, headers: Record<string, string> = {}) =>
  fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'x-forwarded-for': from, ...headers },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
  });

describe('the bearer token', () => {
  it('a POST without one, or with one that names no one, answers 401 with WWW-Authenticate: Bearer', async () => {
    for (const headers of [{}, { authorization: 'Bearer cms_unknown' }] as Record<string, string>[]) {
      const res = await ping('10.1.0.1', headers);
      expect(res.status).toBe(401);
      expect(res.headers.get('www-authenticate')).toBe('Bearer');
      expect(await res.json()).toMatchObject({ error: { code: 'token_required', message: expect.any(String) } });
    }
  });
});

describe('the rate limits', () => {
  it('the 31st request a minute from one address answers 429 with Retry-After, before any token is looked up', async () => {
    for (let i = 0; i < 30; i++) expect((await ping('10.2.0.1')).status).toBe(401);
    const limited = await ping('10.2.0.1', { authorization: `Bearer ${seed.tokens.editorA}` });
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
  });

  it('the 61st request a minute for one user answers 429 with Retry-After, from however many addresses', async () => {
    const asViewer = { authorization: `Bearer ${seed.tokens.viewer}` };
    for (let i = 1; i <= 60; i++) expect((await ping(`10.3.0.${i}`, asViewer)).status).toBe(200);
    const limited = await ping('10.3.1.1', asViewer);
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
  });
});

describe('the interface language', () => {
  // A seeded user has no language of their own, so Accept-Language decides.
  beforeAll(() => upsertPropertyDefinition({ localName: 'colour', groupSlug: 'core', datatype: 'text', label: { en: 'Colour', de: 'Farbe' } }));

  const labelIn = async (acceptLanguage: string, from: string) => {
    const client = new Client({ name: 'http', version: '0.0.0' });
    const headers = { authorization: `Bearer ${seed.tokens.editorA}`, 'accept-language': acceptLanguage, 'x-forwarded-for': from };
    await client.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers } }));
    const res = await client.callTool({ name: 'list_property_definitions', arguments: {} });
    await client.close();
    const defs = JSON.parse((res.content as { text: string }[])[0].text) as { name: string; label: string }[];
    return defs.find((d) => d.name === 'core:colour')?.label;
  };

  it('a tool answers a schema label in the language the request accepts', async () => {
    expect(await labelIn('de-DE,de;q=0.9', '10.4.0.1')).toBe('Farbe');
    expect(await labelIn('en-US,en;q=0.9', '10.4.0.2')).toBe('Colour');
  });
});
