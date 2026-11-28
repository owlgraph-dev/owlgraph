// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { call, startApp, type CallOptions, type ServedApp } from '#tests/integration/http.ts';

// 002.5 over HTTP: what an address and the API answer for a node the asker may
// not read, beside what they answer for one that does not exist, and the one
// exception the criterion names. The seeded restricted page and document are
// editorA's, shared with editorB; editorC is an editor on neither share list.

const app = await startApp();
const seed = inject('seed');

describe.skipIf(app.skipped)('a node the asker may not read, asked for over HTTP', () => {
  const served = app as ServedApp;
  afterAll(() => served.close());

  /** An admin's collection, set to `visibility` by itself. */
  const collectionAt = async (visibility: 'internal' | 'restricted', title: string) => {
    const made = await call(served, '/api/collections', { as: 'admin', json: { title } });
    expect(made.status).toBe(201);
    const { id, slug } = (await made.json()) as { id: string; slug: string };
    expect((await call(served, `/api/collections/${id}`, { as: 'admin', method: 'PATCH', json: { visibility } })).ok).toBe(true);
    return { id, slug, title };
  };

  /** One set to restricted, which no one else reads, and one for everyone who is signed in. */
  let collection: { id: string; slug: string; title: string };
  let internalCollection: { id: string; slug: string; title: string };
  beforeAll(async () => {
    collection = await collectionAt('restricted', 'A collection no one else reads');
    internalCollection = await collectionAt('internal', 'A collection for everyone signed in');
  });

  /** A request's whole answer, as far as a caller can tell two apart. */
  const answer = async (path: string, options: CallOptions = {}) => {
    const res = await call(served, path, options);
    return { status: res.status, location: res.headers.get('location'), type: res.headers.get('content-type'), body: await res.text() };
  };
  /** The error a served page carries for its own script, beside the words it shows. */
  const carriedError = (html: string) => /\berror:\s*(\{[^}]*\})/.exec(html)?.[1];

  const NOWHERE = '/an-address-no-node-has';
  const NOT_READERS: CallOptions[] = [{}, { as: 'editorC' }];

  it('002.5 a restricted page’s or collection’s address answers a visitor, and a signed-in user who may not read it, as an address that does not exist', async () => {
    for (const asker of NOT_READERS) {
      const missing = await answer(NOWHERE, asker);
      expect(missing.status).toBe(404);
      expect(carriedError(missing.body)).toBeDefined();
      for (const [slug, title] of [
        [seed.restrictedSlug, seed.restrictedTitle],
        [collection.slug, collection.title],
      ]) {
        const unreadable = await answer(`/${slug}`, asker);
        expect(unreadable.status).toBe(missing.status);
        expect(unreadable.location).toBeNull();
        expect(unreadable.body).not.toContain(title);
      }
      expect((await answer(`/${seed.restrictedSlug}`, asker)).body).not.toContain(seed.restrictedBody);
    }
  });

  it('002.5 an internal page’s, document’s or collection’s address sends a signed-out visitor to sign in', async () => {
    for (const slug of [seed.internalSlug, seed.docSlug, internalCollection.slug]) {
      const signedOut = await answer(`/${slug}`);
      expect(signedOut.status, slug).toBe(303);
      expect(new URL(signedOut.location!, served.origin).pathname, slug).toBe('/login');
      // Internal, so the address is there for whoever has signed in.
      expect((await answer(`/${slug}`, { as: 'viewer' })).status, slug).toBe(200);
    }
  });

  // Today the page carries 'Page not found' for a page the asker may not read
  // and 'Not found' for an address no node has: the page looks the same, its
  // source and its data do not (reader/routes/read.server.ts).
  it.fails('002.5 a restricted page’s address answers in the words of an address that does not exist', async () => {
    const missing = await answer(NOWHERE, { as: 'editorC' });
    const unreadable = await answer(`/${seed.restrictedSlug}`, { as: 'editorC' });
    expect(carriedError(unreadable.body)).toBe(carriedError(missing.body));
  });

  // Today a signed-out visitor to a document they may not read is sent to sign
  // in, a restricted one included, which says that it exists
  // (reader/routes/read.server.ts).
  it.fails('002.5 a restricted document’s address answers a visitor as an address that does not exist', async () => {
    const missing = await answer(NOWHERE);
    const unreadable = await answer(`/${seed.restrictedDocSlug}`);
    expect(unreadable.status).toBe(missing.status);
    expect(unreadable.location).toBeNull();
  });

  // Today an editor who may not read the page is sent to / from its editor,
  // where an address no node has answers 404 (editor/routes/edit.server.ts).
  it.fails('002.5 the edit address of a page an editor may not read answers as the edit address of one that does not exist', async () => {
    const missing = await answer(`${NOWHERE}/edit`, { as: 'editorC' });
    const unreadable = await answer(`/${seed.restrictedSlug}/edit`, { as: 'editorC' });
    expect(unreadable.status).toBe(missing.status);
  });

  it('002.5 a collection’s API, a file’s address and an image’s address answer for one the caller may not read exactly as for one that does not exist', async () => {
    const rename = { method: 'PATCH', json: { title: 'Renamed by someone who may not read it' } };
    expect(await answer(`/api/collections/${collection.id}`, { as: 'editorC', ...rename })).toEqual(await answer(`/api/collections/${randomUUID()}`, { as: 'editorC', ...rename }));
    for (const asker of NOT_READERS) {
      const noFile = await answer(`/api/documents/${randomUUID()}/content`, asker);
      expect(noFile.status).toBe(404);
      expect(await answer(`/api/documents/${seed.restrictedDocId}/content`, asker)).toEqual(noFile);
      const noImage = await answer(`/api/media/${randomUUID()}`, asker);
      expect(noImage.status).toBe(404);
      expect(await answer(`/api/media/${seed.restrictedAssetId}`, asker)).toEqual(noImage);
    }
  });

  // Today a page's and a document's write API check who may write before who
  // may read: 403 for a node the caller may not read, 404 for an id no node
  // has (pages/routes/api.page.server.ts, documents/routes/api.document.server.ts).
  it.fails('002.5 a write to a page or a document the caller may not read answers as a write to one that does not exist', async () => {
    const rename = { as: 'editorC' as const, method: 'PATCH', json: { title: 'Renamed by someone who may not read it' } };
    expect(await answer(`/api/pages/${seed.restrictedId}`, rename)).toEqual(await answer(`/api/pages/${randomUUID()}`, rename));
    expect(await answer(`/api/documents/${seed.restrictedDocId}`, rename)).toEqual(await answer(`/api/documents/${randomUUID()}`, rename));
  });

  // Today the content address, which needs no session, answers a visitor's PUT
  // 403 for a document that exists and 404 for an id no document has
  // (documents/routes/api.documentContent.server.ts).
  it.fails('002.5 a visitor’s write to the file of a document they may not read answers as a write to one that does not exist', async () => {
    const replace = { method: 'PUT', json: { externalUrl: 'https://example.org/elsewhere' } };
    expect(await answer(`/api/documents/${seed.restrictedDocId}/content`, replace)).toEqual(await answer(`/api/documents/${randomUUID()}/content`, replace));
  });
});
