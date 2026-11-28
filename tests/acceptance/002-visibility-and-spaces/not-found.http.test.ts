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
  /** An id no node can have. */
  const NO_ID = 'not-an-id';
  /** A share link's or a member's id, the same in every request. */
  const LINK = randomUUID();
  const NOT_READERS: CallOptions[] = [{}, { as: 'editorC' }];

  it('002.5 a restricted page’s, document’s or collection’s address answers a visitor, and a signed-in user who may not read it, as an address that does not exist, in its words', async () => {
    for (const asker of NOT_READERS) {
      const missing = await answer(NOWHERE, asker);
      expect(missing.status).toBe(404);
      expect(carriedError(missing.body)).toBeDefined();
      for (const slug of [seed.restrictedSlug, seed.restrictedDocSlug, collection.slug]) {
        const unreadable = await answer(`/${slug}`, asker);
        expect(unreadable.status, slug).toBe(missing.status);
        expect(unreadable.location, slug).toBeNull();
        expect(carriedError(unreadable.body), slug).toBe(carriedError(missing.body));
      }
      for (const [slug, said] of [
        [seed.restrictedSlug, seed.restrictedTitle],
        [seed.restrictedSlug, seed.restrictedBody],
        [collection.slug, collection.title],
      ]) {
        expect((await answer(`/${slug}`, asker)).body).not.toContain(said);
      }
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

  it('002.5 the edit address of a page, document or collection an editor may not read answers as the edit address of one that does not exist', async () => {
    const missing = await answer(`${NOWHERE}/edit`, { as: 'editorC' });
    expect(missing.status).toBe(404);
    expect(carriedError(missing.body)).toBeDefined();
    for (const slug of [seed.restrictedSlug, seed.restrictedDocSlug, collection.slug]) {
      const unreadable = await answer(`/${slug}/edit`, { as: 'editorC' });
      expect(unreadable.status, slug).toBe(missing.status);
      expect(unreadable.location, slug).toBeNull();
      expect(carriedError(unreadable.body), slug).toBe(carriedError(missing.body));
    }
  });

  it('002.5 a file’s address and an image’s address answer for one the caller may not read exactly as for one that does not exist, or for an id that is none', async () => {
    for (const asker of NOT_READERS) {
      const noFile = await answer(`/api/documents/${randomUUID()}/content`, asker);
      expect(noFile.status).toBe(404);
      expect(await answer(`/api/documents/${seed.restrictedDocId}/content`, asker)).toEqual(noFile);
      expect(await answer(`/api/documents/${NO_ID}/content`, asker)).toEqual(noFile);
      const noImage = await answer(`/api/media/${randomUUID()}`, asker);
      expect(noImage.status).toBe(404);
      expect(await answer(`/api/media/${seed.restrictedAssetId}`, asker)).toEqual(noImage);
      expect(await answer(`/api/media/${NO_ID}`, asker)).toEqual(noImage);
    }
  });

  /** Every write the API takes to a node of `kind`, and what it shows only the node's writers: requests made afresh. */
  const writesTo = (kind: 'page' | 'document' | 'collection', id: string): [string, CallOptions][] => {
    const rename: CallOptions = { method: 'PATCH', json: { title: 'Renamed by someone who may not read it' } };
    if (kind === 'page') {
      const image = new FormData();
      image.append('file', new File(['not an image'], 'image.png', { type: 'image/png' }));
      image.append('pageId', id);
      return [
        [`/api/pages/${id}`, { method: 'PUT', json: { type: 'doc', content: [] } }],
        [`/api/pages/${id}`, rename],
        [`/api/pages/${id}`, { method: 'DELETE' }],
        [`/api/pages/${id}/apply-picks`, { json: { picks: [{}] } }],
        [`/api/pages/${id}/lock`, {}],
        [`/api/pages/${id}/lock`, { json: {} }],
        [`/api/pages/${id}/render-blocks`, { json: { blocks: [] } }],
        [`/api/pages/${id}/versions`, {}],
        [`/api/pages/${id}/versions`, { json: { doc: { type: 'doc' } } }],
        [`/api/pages/${id}/share-links`, {}],
        [`/api/pages/${id}/share-links`, { json: {} }],
        [`/api/pages/${id}/share-links/${LINK}`, { method: 'DELETE' }],
        ['/api/media', { body: image }],
      ];
    }
    if (kind === 'document') {
      return [
        [`/api/documents/${id}`, rename],
        [`/api/documents/${id}`, { method: 'DELETE' }],
        [`/api/documents/${id}/content`, { method: 'PUT', json: { externalUrl: 'https://example.org/elsewhere' } }],
        [`/api/documents/${id}/share-links`, {}],
        [`/api/documents/${id}/share-links`, { json: {} }],
        [`/api/documents/${id}/share-links/${LINK}`, { method: 'DELETE' }],
      ];
    }
    return [
      [`/api/collections/${id}`, rename],
      [`/api/collections/${id}`, { method: 'DELETE' }],
      [`/api/collections/${id}/members`, { json: { nodeId: randomUUID() } }],
      [`/api/collections/${id}/members`, { method: 'PUT', json: { order: [], basis: '' } }],
      [`/api/collections/${id}/members/${LINK}`, { method: 'PATCH', json: { label: { en: 'Renamed' } } }],
      [`/api/collections/${id}/members/${LINK}`, { method: 'DELETE' }],
      [`/api/collections/${id}/source`, { method: 'PUT', json: { values: {} } }],
    ];
  };

  it('002.5 a write to a page, document or collection the caller may not read, and what the API shows only its writers, answer as for one that does not exist, or for an id that is none', async () => {
    for (const [kind, id] of [['page', seed.restrictedId], ['document', seed.restrictedDocId], ['collection', collection.id]] as const) {
      const unreadable = writesTo(kind, id);
      const missing = writesTo(kind, randomUUID());
      const malformed = writesTo(kind, NO_ID);
      for (const [i, [path, options]] of missing.entries()) {
        const what = `${options.method ?? (options.json !== undefined || options.body !== undefined ? 'POST' : 'GET')} ${path}`;
        const none = await answer(path, { as: 'editorC', ...options });
        expect(none.status, what).toBe(404);
        expect(await answer(unreadable[i][0], { as: 'editorC', ...unreadable[i][1] }), what).toEqual(none);
        expect(await answer(malformed[i][0], { as: 'editorC', ...malformed[i][1] }), what).toEqual(none);
      }
    }

    // The file's address needs no session: a visitor's write to a file they
    // may not read, restricted or for those who are signed in, is the same.
    const replace: CallOptions = { method: 'PUT', json: { externalUrl: 'https://example.org/elsewhere' } };
    const noFile = await answer(`/api/documents/${randomUUID()}/content`, replace);
    expect(noFile.status).toBe(404);
    for (const id of [seed.restrictedDocId, seed.docId, NO_ID]) expect(await answer(`/api/documents/${id}/content`, replace), id).toEqual(noFile);

    // A lock's token is the lock: leaving one answers alike, page or none.
    const leave: CallOptions = { as: 'editorC', method: 'DELETE', json: { token: randomUUID() } };
    const left = await answer(`/api/pages/${randomUUID()}/lock`, leave);
    for (const id of [seed.restrictedId, NO_ID]) expect(await answer(`/api/pages/${id}/lock`, leave), id).toEqual(left);

    // One the caller reads and may not change is refused as such.
    expect((await answer(`/api/pages/${seed.publicId}`, { as: 'viewer', method: 'PATCH', json: { title: 'Renamed by a viewer' } })).status).toBe(403);
    expect((await answer(`/api/documents/${seed.publicDocId}/content`, replace)).status).toBe(403);
  });
});
