// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { expect, type APIRequestContext, type Page, type Request } from '@playwright/test';
import sharp from 'sharp';
import { db } from '../../src/lib/platform/db.server';
import { sameOrigin } from './fixtures';

// Setup through the HTTP API, as the request context's user: a spec drives the
// UI only for its own flow (docs/guides/testing.md, "Writing specs").

/** A name, with its slug, no other test or earlier run uses. */
export function unique(base: string): { name: string; slug: string } {
  const suffix = Math.random().toString(36).slice(2, 8);
  return { name: `${base} ${suffix}`, slug: `${base.toLowerCase().replace(/\s+/g, '-')}-${suffix}` };
}

export interface PageSetup {
  /** The document to save, `{ type: 'doc', content }` (tests/e2e/doc.ts). */
  doc?: unknown;
  title?: string;
  contentScheme?: 'light' | 'dark' | 'adaptive';
  namespaceId?: string;
  /**
   * `restricted` unless the spec says otherwise: the test database's default
   * namespace is public, and one spec's pages must never turn up in another's
   * lists. `null` inherits.
   */
  visibility?: 'internal' | 'restricted' | null;
}

/**
 * A page of the test's own. Never open a seeded page in the editor: the
 * editor takes the page's edit lock, which outlives the test.
 */
export async function createPage(request: APIRequestContext, setup: PageSetup = {}): Promise<{ id: string; slug: string }> {
  const { doc, title, contentScheme, namespaceId, visibility = 'restricted' } = setup;
  const created = await request.post('/api/pages', namespaceId ? { data: { namespaceId } } : undefined);
  expect(created.ok(), 'create a page').toBe(true);
  const { id, slug } = (await created.json()) as { id: string; slug: string };
  if (visibility) await patchPage(request, id, { visibility });
  if (doc) expect((await request.put(`/api/pages/${id}`, { data: doc })).ok(), 'save the page content').toBe(true);
  if (title === undefined && contentScheme === undefined) return { id, slug };
  const patched = await request.patch(`/api/pages/${id}`, { data: { title, contentScheme } });
  expect(patched.ok(), 'set the page title or scheme').toBe(true);
  // A new title renames the slug.
  return { id, slug: ((await patched.json()) as { slug?: string }).slug ?? slug };
}

/** Changes a node through the page API (title, tags, properties, visibility, nodeClassId, …). */
export async function patchPage(request: APIRequestContext, id: string, data: Record<string, unknown>): Promise<void> {
  expect((await request.patch(`/api/pages/${id}`, { data })).ok(), `patch page ${Object.keys(data).join(', ')}`).toBe(true);
}

/**
 * A real JPEG (an upload is decoded and measured, docs/architecture/media.md), wide enough
 * by default to be offered copies, so the browser picks one from a srcset.
 */
export async function uploadImage(request: APIRequestContext, pageId: string, size = { width: 1600, height: 900 }): Promise<{ id: string; width: number; height: number }> {
  const buffer = await sharp({ create: { ...size, channels: 3, background: { r: 70, g: 100, b: 140 } } }).jpeg().toBuffer();
  const res = await request.post('/api/media', { headers: sameOrigin(), multipart: { pageId, file: { name: 'photo.jpg', mimeType: 'image/jpeg', buffer } } });
  expect(res.ok(), 'upload an image').toBe(true);
  const { id } = (await res.json()) as { id: string };
  return { id, ...size };
}

/** A text document of the test's own, uploaded into `namespaceId` (the default namespace without one). */
export async function createDocument(
  request: APIRequestContext,
  setup: { title: string; namespaceId?: string }
): Promise<{ id: string; slug: string }> {
  const res = await request.post('/api/documents', {
    headers: sameOrigin(),
    multipart: {
      file: { name: `${setup.title}.txt`, mimeType: 'text/plain', buffer: Buffer.from(`e2e: ${setup.title}`) },
      title: setup.title,
      ...(setup.namespaceId ? { namespaceId: setup.namespaceId } : {}),
    },
  });
  expect(res.ok(), 'upload a document').toBe(true);
  return (await res.json()) as { id: string; slug: string };
}

/** A link document of the test's own: an external URL instead of a file. */
export async function createLinkDocument(
  request: APIRequestContext,
  setup: { title: string; url: string; namespaceId?: string }
): Promise<{ id: string; slug: string }> {
  const res = await request.post('/api/documents', {
    headers: sameOrigin(),
    multipart: {
      source: 'link',
      externalUrl: setup.url,
      title: setup.title,
      ...(setup.namespaceId ? { namespaceId: setup.namespaceId } : {}),
    },
  });
  expect(res.ok(), 'create a link document').toBe(true);
  return (await res.json()) as { id: string; slug: string };
}

/** A namespace, through the settings so the server's route matcher learns of it. Returns its id. */
export async function createNamespace(
  request: APIRequestContext,
  ns: { name: string; slug: string; accessLevel?: 'public' | 'internal' | 'restricted' }
): Promise<string> {
  const result = await formAction(request, '/settings/namespaces?/create', { name: ns.name, slug: ns.slug, accessLevel: ns.accessLevel ?? 'internal' });
  expect(result.type, `create namespace ${ns.slug}`).toBe('success');
  const [row] = await db<{ id: string }[]>`select id from namespaces where slug = ${ns.slug}`;
  return row.id;
}

export async function deleteNamespace(request: APIRequestContext, id: string): Promise<void> {
  expect((await formAction(request, '/settings/namespaces?/delete', { id })).type, 'delete namespace').toBe('success');
}

/** A domain class under `parent` (a node type or another class, by key). Returns its id. */
export async function createClass(
  request: APIRequestContext,
  cls: { slug: string; label: string; parent?: string; propertyGroup?: string }
): Promise<string> {
  const [parent] = await db<{ id: string }[]>`select id from node_classes where slug = ${cls.parent ?? 'page'}`;
  const result = await formAction(request, '/settings/schema/classes?/save', {
    slug: cls.slug,
    // Localized text: one input per locale, English required (docs/architecture/languages.md).
    'label.en': cls.label,
    parentId: parent.id,
    propertyGroup: cls.propertyGroup ?? '',
  });
  expect(result.type, `create class ${cls.slug}`).toBe('success');
  return classId(cls.slug);
}

export async function classId(slug: string): Promise<string> {
  const [row] = await db<{ id: string }[]>`select id from node_classes where slug = ${slug}`;
  return row.id;
}

/** Deletes a class by key, if it exists (a cleanup that never fails the test it follows). */
export async function deleteClass(request: APIRequestContext, slug: string): Promise<void> {
  const [row] = await db<{ id: string }[]>`select id from node_classes where slug = ${slug}`;
  if (row) await formAction(request, '/settings/schema/classes?/delete', { id: row.id });
}

/** A session as a Playwright storage state: its cookie, valid on any port. */
export interface SessionState {
  cookies: { name: string; value: string; domain: string; path: string; expires: number; httpOnly: boolean; secure: boolean; sameSite: 'Lax' }[];
  origins: [];
}

async function newSessionState(userId: string): Promise<SessionState> {
  const { createSession } = await import('../../src/lib/features/auth/server');
  const { token, expires } = await createSession(userId);
  return {
    cookies: [{ name: 'session', value: token, domain: 'localhost', path: '/', expires: Math.floor(expires.getTime() / 1000), httpOnly: true, secure: false, sameSite: 'Lax' }],
    origins: [],
  };
}

/**
 * A signed-in user of the test's own, for a test that changes what a seeded
 * account would carry into every other test (its language, a connection).
 */
export async function throwawayUserState(role: 'admin' | 'editor' | 'viewer' = 'editor'): Promise<{ userId: string; storageState: SessionState }> {
  const { createUser } = await import('../../src/lib/features/auth/server');
  const { slug } = unique('e2e-user');
  const user = await createUser({ email: `${slug}@test`, name: slug, password: 'e2e-seed-password', role });
  return { userId: user.id, storageState: await newSessionState(user.id) };
}

/** Another session of a user — what a second browser of theirs holds. */
export async function sessionStateFor(userId: string): Promise<SessionState> {
  return newSessionState(userId);
}

/** What a SvelteKit form action answers an enhanced form. */
export interface ActionResult {
  type: 'success' | 'failure' | 'redirect' | 'error';
  status?: number;
  data?: string;
}

/** Posts to a form action (`/settings/page-layouts?/createPreset`) as an enhanced form does. */
export async function formAction(request: APIRequestContext, path: string, form: Record<string, string>): Promise<ActionResult> {
  const res = await request.post(path, { form, headers: { ...sameOrigin(), 'x-sveltekit-action': 'true' } });
  return (await res.json()) as ActionResult;
}

// Two frames: the page has done what it does with a response it has read.
const frames = (page: Page) => page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));

/**
 * Waits for the form action a click posts, and for SvelteKit to have applied
 * its result. An enhanced form reloads the page's data after the response, and
 * then moves the focus to the page as a navigation does: a field typed into
 * meanwhile loses the focus, and what is typed next goes nowhere. A reload is
 * waited for to its answer, not its end: the data streams, and the end of a
 * stream is not always reported.
 */
export async function posting(page: Page, action: string, click: () => Promise<void>): Promise<void> {
  const reloads: Promise<unknown>[] = [];
  const onRequest = (r: Request) => {
    if (r.method() === 'GET' && new URL(r.url()).pathname.endsWith('/__data.json')) reloads.push(r.response());
  };
  const done = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().includes(`?/${action}`));
  page.on('request', onRequest);
  try {
    await click();
    const response = await done;
    expect(response.ok(), action).toBe(true);
    await response.finished();
    await frames(page);
    await Promise.all(reloads);
    await frames(page);
  } finally {
    page.off('request', onRequest);
  }
}
