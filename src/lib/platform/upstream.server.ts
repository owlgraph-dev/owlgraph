// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The one way server code requests another service (docs/architecture/authorization.md,
// "Requests to other services"): only an origin an administrator configured,
// never one from a client or from content. A redirect is never followed.
// Callers log by label, never by URL: a path can carry a credential.
import { request as httpRequest, type IncomingHttpHeaders, type IncomingMessage, type ClientRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { Readable, Transform } from 'node:stream';

/** 'insecure' is plain http to a host other than loopback. */
export type OriginProblem = 'invalid' | 'scheme' | 'credentials' | 'path' | 'insecure';

/** Plain http to a loopback host, for the e2e harness's mock services; never a deployment. */
export function loopbackHttpAllowed(): boolean {
  return process.env.INTEGRATIONS_ALLOW_HTTP_LOOPBACK === '1';
}

function isLoopback(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '[::1]' || /^127(?:\.\d{1,3}){3}$/.test(hostname);
}

/** An administrator's origin, normalized (`https://host[:port]`), or why it is refused. */
export function parseUpstreamOrigin(input: string, opts: { allowLoopbackHttp?: boolean } = {}): { origin: string } | { problem: OriginProblem } {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return { problem: 'invalid' };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return { problem: 'scheme' };
  if (url.username || url.password) return { problem: 'credentials' };
  if (url.pathname !== '/' || url.search || url.hash || input.trim().endsWith('?') || input.trim().endsWith('#')) return { problem: 'path' };
  if (url.protocol === 'http:' && !(opts.allowLoopbackHttp && isLoopback(url.hostname))) return { problem: 'insecure' };
  return { origin: url.origin };
}

export type UpstreamMethod = 'GET' | 'HEAD' | 'PROPFIND' | 'SEARCH' | 'POST' | 'DELETE';

/** A client's default: reading, WebDAV's ways included. */
export const READ_METHODS: readonly UpstreamMethod[] = ['GET', 'HEAD', 'PROPFIND', 'SEARCH'];

export interface UpstreamRequest {
  method: UpstreamMethod;
  /** Absolute (`/…`) and already encoded, query included; never another host. */
  path: string;
  headers?: Readonly<Record<string, string>>;
  body?: string;
  maxBytes: number;
}

/** `off_origin` and `method` are refused before anything is sent. */
export type UpstreamFailure = 'timeout' | 'unreachable' | 'redirect' | 'too_large' | 'off_origin' | 'method';

export type UpstreamResult =
  | { kind: 'response'; status: number; headers: IncomingHttpHeaders; body: Buffer }
  | { kind: 'failure'; failure: UpstreamFailure; status?: number };

export type UpstreamStreamResult =
  | { kind: 'response'; status: number; headers: IncomingHttpHeaders; body: ReadableStream<Uint8Array> }
  | { kind: 'failure'; failure: UpstreamFailure; status?: number };

export interface UpstreamClient {
  readonly origin: string;
  /** The whole response, buffered. */
  fetch(req: UpstreamRequest): Promise<UpstreamResult>;
  /** The body as a stream, which errors past the cap. */
  stream(req: UpstreamRequest): Promise<UpstreamStreamResult>;
}

export interface UpstreamLimits {
  connectTimeoutMs: number;
  /** A buffered exchange's whole duration, waiting for a slot included. */
  totalTimeoutMs: number;
  /** A streamed body's: until its headers, waiting for a slot included … */
  headersTimeoutMs: number;
  /** … then between two chunks. */
  idleTimeoutMs: number;
  /** Per origin. */
  maxInFlight: number;
}

export const DEFAULT_UPSTREAM_LIMITS: UpstreamLimits = {
  connectTimeoutMs: 2_000,
  totalTimeoutMs: 10_000,
  headersTimeoutMs: 10_000,
  idleTimeoutMs: 30_000,
  maxInFlight: 8,
};

// Slots per origin, shared by every client of that origin in this process.
const slots = new Map<string, { active: number; waiting: (() => void)[] }>();

function slotsOf(origin: string) {
  let entry = slots.get(origin);
  if (!entry) slots.set(origin, (entry = { active: 0, waiting: [] }));
  return entry;
}

/** Waits for a slot; resolves to a release function, or null when `signal` aborts first. */
function acquire(origin: string, max: number, signal: AbortSignal): Promise<(() => void) | null> {
  const entry = slotsOf(origin);
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    entry.active--;
    entry.waiting.shift()?.();
  };
  if (entry.active < max) {
    entry.active++;
    return Promise.resolve(release);
  }
  if (signal.aborted) return Promise.resolve(null);
  return new Promise((resolve) => {
    const take = () => {
      signal.removeEventListener('abort', give);
      entry.active++;
      resolve(release);
    };
    const give = () => {
      entry.waiting.splice(entry.waiting.indexOf(take), 1);
      resolve(null);
    };
    entry.waiting.push(take);
    signal.addEventListener('abort', give, { once: true });
  });
}

class Timeout extends Error {}
class TooLarge extends Error {}

/** Resolves with the response's head; rejects with a Timeout on `deadline` or a slow connect. */
function send(url: URL, req: UpstreamRequest, limits: UpstreamLimits, deadline: AbortSignal): Promise<{ res: IncomingMessage; outgoing: ClientRequest }> {
  return new Promise((resolve, reject) => {
    const open = url.protocol === 'https:' ? httpsRequest : httpRequest;
    const headers: Record<string, string> = { ...req.headers };
    if (req.body !== undefined) headers['content-length'] = String(Buffer.byteLength(req.body));
    const outgoing = open(url, { method: req.method, headers });
    const fail = (error: Error) => {
      outgoing.destroy(error);
      reject(error);
    };
    const onDeadline = () => fail(new Timeout());
    if (deadline.aborted) return onDeadline();
    deadline.addEventListener('abort', onDeadline, { once: true });
    outgoing.on('socket', (socket) => {
      if (!socket.connecting) return;
      const connectTimer = setTimeout(() => fail(new Timeout()), limits.connectTimeoutMs);
      socket.once(url.protocol === 'https:' ? 'secureConnect' : 'connect', () => clearTimeout(connectTimer));
      socket.once('close', () => clearTimeout(connectTimer));
    });
    outgoing.on('response', (res) => {
      deadline.removeEventListener('abort', onDeadline);
      resolve({ res, outgoing });
    });
    outgoing.on('error', (error) => {
      deadline.removeEventListener('abort', onDeadline);
      reject(error);
    });
    outgoing.end(req.body);
  });
}

const failure = (kind: UpstreamFailure, status?: number) => ({ kind: 'failure' as const, failure: kind, ...(status !== undefined ? { status } : {}) });

/** A client for an origin parseUpstreamOrigin accepted; it sends only `opts.methods` (reading by default). */
export function upstreamClient(origin: string, limits: Partial<UpstreamLimits> = {}, opts: { methods?: readonly UpstreamMethod[] } = {}): UpstreamClient {
  const l: UpstreamLimits = { ...DEFAULT_UPSTREAM_LIMITS, ...limits };
  const allowed: ReadonlySet<string> = new Set(opts.methods ?? READ_METHODS);

  // The path stays on the origin, or nothing is sent.
  function urlFor(path: string): URL | null {
    if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) return null;
    const url = new URL(path, origin);
    return url.origin === origin ? url : null;
  }

  // A redirect counts as no response.
  async function head(req: UpstreamRequest, deadline: AbortSignal) {
    if (!allowed.has(req.method)) return failure('method');
    const url = urlFor(req.path);
    if (!url) return failure('off_origin');
    const release = await acquire(origin, l.maxInFlight, deadline);
    if (!release) return failure('timeout');
    try {
      const { res, outgoing } = await send(url, req, l, deadline);
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400) {
        res.resume();
        outgoing.destroy();
        release();
        return failure('redirect', res.statusCode);
      }
      const declared = Number(res.headers['content-length']);
      if (Number.isFinite(declared) && declared > req.maxBytes) {
        outgoing.destroy();
        release();
        return failure('too_large', res.statusCode);
      }
      return { kind: 'head' as const, res, outgoing, release };
    } catch (error) {
      release();
      return failure(error instanceof Timeout ? 'timeout' : 'unreachable');
    }
  }

  return {
    origin,

    async fetch(req) {
      const deadline = AbortSignal.timeout(l.totalTimeoutMs);
      const h = await head(req, deadline);
      if (h.kind !== 'head') return h;
      const { res, outgoing, release } = h;
      try {
        const body = await new Promise<Buffer>((resolve, reject) => {
          const chunks: Buffer[] = [];
          let size = 0;
          const onDeadline = () => {
            outgoing.destroy();
            reject(new Timeout());
          };
          deadline.addEventListener('abort', onDeadline, { once: true });
          res.on('data', (chunk: Buffer) => {
            size += chunk.length;
            if (size > req.maxBytes) {
              deadline.removeEventListener('abort', onDeadline);
              outgoing.destroy();
              reject(new TooLarge());
              return;
            }
            chunks.push(chunk);
          });
          res.on('end', () => {
            deadline.removeEventListener('abort', onDeadline);
            resolve(Buffer.concat(chunks));
          });
          res.on('error', (error) => {
            deadline.removeEventListener('abort', onDeadline);
            reject(error);
          });
        });
        return { kind: 'response', status: res.statusCode ?? 0, headers: res.headers, body };
      } catch (error) {
        return failure(error instanceof TooLarge ? 'too_large' : error instanceof Timeout ? 'timeout' : 'unreachable', res.statusCode);
      } finally {
        release();
      }
    },

    async stream(req) {
      const h = await head(req, AbortSignal.timeout(l.headersTimeoutMs));
      if (h.kind !== 'head') return h;
      const { res, outgoing, release } = h;
      // A slow reader of a large file must not hold the slot for the whole download.
      release();
      let size = 0;
      const capped = new Transform({
        transform(chunk: Buffer, _encoding, done) {
          size += chunk.length;
          done(size > req.maxBytes ? new TooLarge() : null, chunk);
        },
      });
      res.setTimeout(l.idleTimeoutMs, () => outgoing.destroy(new Timeout()));
      res.on('error', (error) => capped.destroy(error));
      res.pipe(capped);
      capped.on('close', () => outgoing.destroy());
      return { kind: 'response', status: res.statusCode ?? 0, headers: res.headers, body: Readable.toWeb(capped) as ReadableStream<Uint8Array> };
    },
  };
}

