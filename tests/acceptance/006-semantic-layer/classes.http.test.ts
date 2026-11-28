// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { JSDOM } from 'jsdom';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createCollection } from '#lib/features/collections/server.ts';
import { createLinkDocument } from '#lib/features/documents/server.ts';
import { getNodeClassRefs, listNodeClasses, setNodeClasses, upsertNodeClass } from '#lib/features/semantic/server.ts';
import { call, createPage, startApp, type CallOptions, type ServedApp } from '#tests/integration/http.ts';
import { userOf } from '#tests/integration/users.ts';

// A node's classes over HTTP (docs/features/006-semantic-layer.md, criteria 6
// and 9): who may give and take them, and where they are shown.

const app = await startApp();

describe.skipIf(app.skipped)('a node’s classes, over HTTP', () => {
  const served = app as ServedApp;
  afterAll(() => served.close());

  let made = 0;
  const typeId = async (kind: 'page' | 'document' | 'collection') => (await listNodeClasses()).find((c) => c.kind === 'type' && c.slug === kind)!.id;
  /** Two classes of the test's own under `kind`'s type, labelled `<name> <n>`. */
  const twoClasses = async (kind: 'page' | 'document' | 'collection') => {
    const parentId = await typeId(kind);
    const one = async (name: string) => {
      const label = `${name} ${++made}`;
      return { ...(await upsertNodeClass({ slug: `${name.toLowerCase()}-${made}`, label: { en: label }, parentId })), label };
    };
    return [await one('Ledger'), await one('Minutes')];
  };
  const classesOf = async (id: string) => (await getNodeClassRefs(id)).map((c) => c.id).sort();
  const patchClasses = (id: string, classIds: string[], asker: CallOptions) => call(served, `/api/pages/${id}`, { ...asker, method: 'PATCH', json: { classIds } });

  it('006.6 whoever may change a node gives it classes and takes them away; a viewer, and an editor who may not read it, change none of them', async () => {
    const [ledger, minutes] = await twoClasses('page');
    const page = await createPage(served, 'editorA', { visibility: 'restricted' });

    const given = await patchClasses(page.id, [ledger.id, minutes.id], { as: 'editorA' });
    expect(given.status).toBe(200);
    expect(((await given.json()) as { classIds: string[] }).classIds.sort()).toEqual([ledger.id, minutes.id].sort());
    expect(await classesOf(page.id)).toEqual([ledger.id, minutes.id].sort());

    // An editor on no share list may not read it; a viewer reads an open page and changes none.
    expect((await patchClasses(page.id, [], { as: 'editorC' })).status).toBe(404);
    expect(await classesOf(page.id)).toEqual([ledger.id, minutes.id].sort());
    const open = await createPage(served, 'editorA');
    expect((await patchClasses(open.id, [ledger.id], { as: 'viewer' })).status).toBe(403);
    expect(await classesOf(open.id)).toEqual([await typeId('page')]);

    expect((await patchClasses(page.id, [minutes.id], { as: 'editorA' })).status).toBe(200);
    expect(await classesOf(page.id)).toEqual([minutes.id]);
  });

  describe('where a node’s classes are shown', () => {
    const admin = { as: 'admin' } as const;
    let collection: { slug: string; classes: string[] };
    let document: { slug: string; classes: string[] };
    let page: { title: string; classes: string[] };
    beforeAll(async () => {
      const by = await userOf('admin');
      const madeCollection = await createCollection({ title: 'A classified collection', createdBy: by.id, user: by });
      const collectionClasses = await twoClasses('collection');
      await setNodeClasses(madeCollection.id, collectionClasses.map((c) => c.id));
      collection = { slug: madeCollection.slug, classes: collectionClasses.map((c) => c.label) };

      const madeDocument = await createLinkDocument({ url: 'https://example.org/file', title: 'A classified document', createdBy: by.id, user: by });
      const documentClasses = await twoClasses('document');
      await setNodeClasses(madeDocument.id, documentClasses.map((c) => c.id));
      document = { slug: madeDocument.slug, classes: documentClasses.map((c) => c.label) };

      const madePage = await createPage(served, 'admin', { title: 'A classified page' });
      const pageClasses = await twoClasses('page');
      await setNodeClasses(madePage.id, pageClasses.map((c) => c.id));
      page = { title: 'A classified page', classes: pageClasses.map((c) => c.label) };
    });

    it('006.9 a node’s header, a document’s page and a query’s result in the API name every class the node has', async () => {
      const text = async (path: string) => new JSDOM(await (await call(served, path, admin)).text()).window.document.body.textContent ?? '';
      const header = await text(`/${collection.slug}`);
      for (const label of collection.classes) expect(header, `the collection's header`).toContain(label);
      const documentPage = await text(`/${document.slug}`);
      for (const label of document.classes) expect(documentPage, `the document's page`).toContain(label);

      const query = 'query($filter: NodeFilter!) { nodes(filter: $filter) { title classes { name } } }';
      const filter = { intrinsic: { field: 'TITLE', operator: 'EQ', value: page.title } };
      const res = await call(served, '/api/graphql', { ...admin, json: { query, variables: { filter } } });
      const body = (await res.json()) as { data?: { nodes: { title: string; classes: { name: string }[] }[] }; errors?: unknown };
      expect(body.errors).toBeUndefined();
      expect(body.data!.nodes.map((n) => n.classes.map((c) => c.name))).toEqual([[...page.classes].sort()]);
    });
  });
});
