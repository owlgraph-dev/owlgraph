// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The production build's handler, served in-process for an HTTP test against
// the file's cloned database (docs/guides/testing.md, "HTTP tests"). Each file runs in
// a worker of its own, so rate limiters and caches start fresh. Without a
// current build the tests are skipped, and with CI set they fail. A request
// names its client (X-Forwarded-For), so a limit by address fills its own bucket.
import { createServer, type Server } from 'node:http';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse as parseDevalue } from 'devalue';
import { db } from '$lib/platform/db.server';
import { createSession } from '$lib/features/auth/server';
import { buildState } from './build';
import { userOf, type Role } from './users';

/** The origin the app believes it is served from: what a form post's Origin header must carry. */
export const ORIGIN = 'http://owlgraph.test';

/** The client address a request comes from unless it names one. */
const CLIENT = '192.0.2.1';

export type App =
  | { skipped: false; url: string; origin: string; close: () => Promise<void> }
  | { skipped: true; reason: string };

/** A served app; `describe.skipIf(app.skipped)` keeps a test from reaching a skipped one. */
export type ServedApp = Extract<App, { skipped: false }>;

export async function startApp(): Promise<App> {
  const state = buildState();
  if (!state.ready) {
    if (process.env.CI) throw new Error(`HTTP tests need a current build: ${state.reason}.`);
    return { skipped: true, reason: state.reason };
  }
  // Read once, when adapter-node's handler is imported.
  process.env.ORIGIN = ORIGIN;
  process.env.ADDRESS_HEADER = 'x-forwarded-for';
  // A native import (build/ is external): Vite's transform would only get in the way.
  const { handler } = (await import(/* @vite-ignore */ pathToFileURL(resolve('build/handler.js')).href)) as {
    handler: Parameters<typeof createServer>[1];
  };
  const server: Server = createServer(handler);
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('The app did not get a port.');
  return {
    skipped: false,
    url: `http://127.0.0.1:${address.port}`,
    origin: ORIGIN,
    close: () => new Promise<void>((done) => server.close(() => done())),
  };
}

const cookies = new Map<Role, Promise<string>>();

/** The session cookie of a seeded role's user — one session per role and file. */
export function cookieFor(role: Role): Promise<string> {
  if (!cookies.has(role)) cookies.set(role, userOf(role).then(async (user) => `session=${(await createSession(user.id)).token}`));
  return cookies.get(role)!;
}

export interface CallOptions {
  /** The seeded role the request is made as; anonymous when absent. */
  as?: Role;
  /** A session cookie of its own (`session=…`), for one made in the test. */
  cookie?: string;
  /** The client address it comes from. */
  from?: string;
  method?: string;
  headers?: Record<string, string>;
  /** A JSON body (sets the content type). */
  json?: unknown;
  body?: BodyInit;
}

/** A request to the app, redirects not followed; a write carries the app's origin, as a browser's would. */
export async function call(app: ServedApp, path: string, options: CallOptions = {}): Promise<Response> {
  const method = options.method ?? (options.json !== undefined || options.body !== undefined ? 'POST' : 'GET');
  // What a browser accepts: fetch's own `*/*` would have SvelteKit answer a
  // form post as an enhanced form's JSON, and an error as JSON.
  const accept = options.json !== undefined ? 'application/json' : 'text/html,application/xhtml+xml,*/*;q=0.8';
  const headers: Record<string, string> = { accept, 'x-forwarded-for': options.from ?? CLIENT, ...options.headers };
  const cookie = options.cookie ?? (options.as ? await cookieFor(options.as) : undefined);
  if (cookie) headers.cookie = cookie;
  if (method !== 'GET' && method !== 'HEAD') headers.origin ??= ORIGIN;
  let body = options.body;
  if (options.json !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(options.json);
  }
  return fetch(`${app.url}${path}`, { method, headers, body, redirect: 'manual' });
}

/**
 * A page of the test's own, made through the page API as `role`: in
 * `namespaceId`'s namespace, holding `doc`, then patched with the other
 * fields (visibility, shares, title, …). A new title renames the slug.
 */
export async function createPage(
  app: ServedApp,
  as: Role,
  { namespaceId, doc, ...fields }: { namespaceId?: string; doc?: unknown } & Record<string, unknown> = {}
): Promise<{ id: string; slug: string }> {
  const created = await call(app, '/api/pages', { as, method: 'POST', json: namespaceId ? { namespaceId } : {} });
  if (!created.ok) throw new Error(`creating a page as ${as} answered ${created.status}: ${await created.text()}`);
  const { id, slug } = (await created.json()) as { id: string; slug: string };
  if (doc) {
    const saved = await call(app, `/api/pages/${id}`, { as, method: 'PUT', json: doc });
    if (!saved.ok) throw new Error(`saving page ${id} as ${as} answered ${saved.status}: ${await saved.text()}`);
  }
  if (!Object.keys(fields).length) return { id, slug };
  const patched = await call(app, `/api/pages/${id}`, { as, method: 'PATCH', json: fields });
  if (!patched.ok) throw new Error(`patching page ${id} as ${as} answered ${patched.status}: ${await patched.text()}`);
  return { id, slug: ((await patched.json()) as { slug?: string }).slug ?? slug };
}

/**
 * A namespace of the test's own, made through the settings so the served
 * build's route matcher learns of it. Returns its id.
 */
export async function createNamespace(
  app: ServedApp,
  ns: { name: string; slug: string; accessLevel?: 'public' | 'internal' | 'restricted' }
): Promise<string> {
  const result = await formAction(app, '/settings/namespaces?/create', { name: ns.name, slug: ns.slug, accessLevel: ns.accessLevel ?? 'internal' }, { as: 'admin' });
  if (result.type !== 'success') throw new Error(`creating namespace ${ns.slug} answered ${result.type} ${result.status}: ${JSON.stringify(result.data)}`);
  const [row] = await db<{ id: string }[]>`select id from namespaces where slug = ${ns.slug}`;
  return row.id;
}

/** What a SvelteKit form action answers an enhanced form, its data read back. */
export interface ActionResult {
  status: number;
  type: 'success' | 'failure' | 'redirect' | 'error';
  data?: unknown;
  location?: string;
  /** The response itself, for its headers (a session cookie, for one). */
  response: Response;
}

/** Posts to a form action (`/settings/users?/save`) as an enhanced form does, multipart with files. */
export async function formAction(
  app: ServedApp,
  path: string,
  fields: Record<string, string>,
  options: Omit<CallOptions, 'json' | 'body' | 'method'> & { files?: Record<string, File> } = {}
): Promise<ActionResult> {
  let body: BodyInit;
  if (options.files) {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.append(k, v);
    for (const [k, f] of Object.entries(options.files)) form.append(k, f);
    body = form;
  } else {
    body = new URLSearchParams(fields);
  }
  const response = await call(app, path, {
    ...options,
    method: 'POST',
    body,
    headers: { accept: 'application/json', 'x-sveltekit-action': 'true', ...options.headers },
  });
  const result = (await response.clone().json()) as { type: ActionResult['type']; status?: number; data?: string; location?: string };
  return {
    status: result.status ?? response.status,
    type: result.type,
    data: typeof result.data === 'string' ? parseDevalue(result.data) : result.data,
    location: result.location,
    response,
  };
}
