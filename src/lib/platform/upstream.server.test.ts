// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { parseUpstreamOrigin, upstreamClient } from './upstream.server';

describe('parseUpstreamOrigin', () => {
  const ok = (input: string, allowLoopbackHttp = false) => parseUpstreamOrigin(input, { allowLoopbackHttp });

  it('takes a bare https origin, normalized', () => {
    expect(ok('https://cloud.example.com')).toEqual({ origin: 'https://cloud.example.com' });
    expect(ok(' https://Cloud.Example.com:8443/ ')).toEqual({ origin: 'https://cloud.example.com:8443' });
  });

  it('refuses anything that is not a bare origin', () => {
    expect(ok('cloud.example.com')).toEqual({ problem: 'invalid' });
    expect(ok('ftp://cloud.example.com')).toEqual({ problem: 'scheme' });
    expect(ok('https://user:pw@cloud.example.com')).toEqual({ problem: 'credentials' });
    expect(ok('https://cloud.example.com/cloud')).toEqual({ problem: 'path' });
    expect(ok('https://cloud.example.com/?x=1')).toEqual({ problem: 'path' });
    expect(ok('https://cloud.example.com/#x')).toEqual({ problem: 'path' });
    expect(ok('https://cloud.example.com?')).toEqual({ problem: 'path' });
  });

  it('takes plain http only for a loopback host, and only when allowed', () => {
    expect(ok('http://cloud.example.com')).toEqual({ problem: 'insecure' });
    expect(ok('http://127.0.0.1:8080')).toEqual({ problem: 'insecure' });
    expect(ok('http://127.0.0.1:8080', true)).toEqual({ origin: 'http://127.0.0.1:8080' });
    expect(ok('http://localhost:8080', true)).toEqual({ origin: 'http://localhost:8080' });
    expect(ok('http://[::1]:8080', true)).toEqual({ origin: 'http://[::1]:8080' });
    expect(ok('http://cloud.example.com', true)).toEqual({ problem: 'insecure' });
  });
});

describe('an upstream client', () => {
  let server: Server;
  let origin: string;
  let requests: string[] = [];
  let inFlight = 0;
  let maxInFlight = 0;

  const routes: Record<string, (req: IncomingMessage, res: ServerResponse) => void> = {
    '/ok': (req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain', 'x-method': req.method ?? '' });
      res.end('hello');
    },
    '/echo': (req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => res.end(`${req.method} ${req.headers['x-requested-with'] ?? ''} ${body}`));
    },
    '/missing': (_req, res) => {
      res.writeHead(404);
      res.end('no');
    },
    '/redirect': (_req, res) => {
      res.writeHead(302, { location: 'http://127.0.0.1:1/elsewhere' });
      res.end();
    },
    // Chunked: no content-length, so only the bytes themselves can tell.
    '/big': (_req, res) => {
      res.write('x'.repeat(2048));
      res.end('x'.repeat(2048));
    },
    '/big-declared': (_req, res) => {
      res.writeHead(200, { 'content-length': '4096' });
      res.end('x'.repeat(4096));
    },
    '/slow': (_req, res) => {
      setTimeout(() => res.end('late'), 400);
    },
    '/held': (_req, res) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      setTimeout(() => {
        inFlight--;
        res.end('done');
      }, 80);
    },
  };

  beforeAll(async () => {
    server = createServer((req, res) => {
      requests.push(req.url ?? '');
      (routes[req.url ?? ''] ?? routes['/missing'])(req, res);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it('fetches a response, any status, with its body', async () => {
    const client = upstreamClient(origin);
    const ok = await client.fetch({ method: 'GET', path: '/ok', maxBytes: 1024 });
    expect(ok).toMatchObject({ kind: 'response', status: 200 });
    expect(ok.kind === 'response' && ok.body.toString()).toBe('hello');
    expect(await client.fetch({ method: 'GET', path: '/missing', maxBytes: 1024 })).toMatchObject({ kind: 'response', status: 404 });
  });

  it('sends the method, headers and body it is given', async () => {
    const res = await upstreamClient(origin).fetch({ method: 'PROPFIND', path: '/echo', headers: { 'x-requested-with': 'XMLHttpRequest' }, body: '<propfind/>', maxBytes: 1024 });
    expect(res.kind === 'response' && res.body.toString()).toBe('PROPFIND XMLHttpRequest <propfind/>');
  });

  it('refuses a path that would leave the origin, sending nothing', async () => {
    const client = upstreamClient(origin);
    requests = [];
    for (const path of ['//evil.example/x', 'https://evil.example/x', 'relative', '/\\evil.example']) {
      expect(await client.fetch({ method: 'GET', path, maxBytes: 1024 }), path).toEqual({ kind: 'failure', failure: 'off_origin' });
    }
    expect(requests).toEqual([]);
  });

  it('reads by default — what changes something at the service only from a client made for it, sending nothing otherwise', async () => {
    requests = [];
    for (const method of ['POST', 'DELETE'] as const) {
      expect(await upstreamClient(origin).fetch({ method, path: '/echo', body: 'x', maxBytes: 1024 }), method).toEqual({ kind: 'failure', failure: 'method' });
      expect(await upstreamClient(origin).stream({ method, path: '/echo', maxBytes: 1024 }), method).toEqual({ kind: 'failure', failure: 'method' });
    }
    expect(requests).toEqual([]);
    const search = await upstreamClient(origin).fetch({ method: 'SEARCH', path: '/echo', body: '<searchrequest/>', maxBytes: 1024 });
    expect(search.kind === 'response' && search.body.toString()).toBe('SEARCH  <searchrequest/>');
    const writer = upstreamClient(origin, {}, { methods: ['POST', 'DELETE'] });
    const posted = await writer.fetch({ method: 'POST', path: '/echo', body: 'token=1', maxBytes: 1024 });
    expect(posted.kind === 'response' && posted.body.toString()).toBe('POST  token=1');
    // Made for writing alone, it reads nothing.
    expect(await writer.fetch({ method: 'GET', path: '/ok', maxBytes: 1024 })).toEqual({ kind: 'failure', failure: 'method' });
  });

  it('never follows a redirect', async () => {
    requests = [];
    expect(await upstreamClient(origin).fetch({ method: 'GET', path: '/redirect', maxBytes: 1024 })).toEqual({ kind: 'failure', failure: 'redirect', status: 302 });
    expect(requests).toEqual(['/redirect']);
  });

  it('refuses a body over the cap, declared or not', async () => {
    const client = upstreamClient(origin);
    expect(await client.fetch({ method: 'GET', path: '/big', maxBytes: 1024 })).toMatchObject({ kind: 'failure', failure: 'too_large' });
    expect(await client.fetch({ method: 'GET', path: '/big-declared', maxBytes: 1024 })).toMatchObject({ kind: 'failure', failure: 'too_large' });
  });

  it('gives up when the time runs out', async () => {
    expect(await upstreamClient(origin, { totalTimeoutMs: 100 }).fetch({ method: 'GET', path: '/slow', maxBytes: 1024 })).toEqual({ kind: 'failure', failure: 'timeout' });
  });

  it('reports an unreachable service', async () => {
    const closed = createServer();
    await new Promise<void>((resolve) => closed.listen(0, '127.0.0.1', resolve));
    const port = (closed.address() as AddressInfo).port;
    await new Promise<void>((resolve) => closed.close(() => resolve()));
    expect(await upstreamClient(`http://127.0.0.1:${port}`).fetch({ method: 'GET', path: '/ok', maxBytes: 1024 })).toEqual({ kind: 'failure', failure: 'unreachable' });
  });

  it('keeps the requests in flight to one origin under its limit', async () => {
    maxInFlight = 0;
    const client = upstreamClient(origin, { maxInFlight: 2 });
    const results = await Promise.all(Array.from({ length: 6 }, () => client.fetch({ method: 'GET', path: '/held', maxBytes: 1024 })));
    expect(results.every((r) => r.kind === 'response' && r.status === 200)).toBe(true);
    expect(maxInFlight).toBe(2);
  });

  it('streams a body, and errors the stream past the cap', async () => {
    const client = upstreamClient(origin);
    const ok = await client.stream({ method: 'GET', path: '/ok', maxBytes: 1024 });
    expect(ok.kind).toBe('response');
    if (ok.kind === 'response') expect(await new Response(ok.body).text()).toBe('hello');
    const big = await client.stream({ method: 'GET', path: '/big', maxBytes: 1024 });
    expect(big.kind).toBe('response');
    if (big.kind === 'response') await expect(new Response(big.body).text()).rejects.toThrow();
  });
});
