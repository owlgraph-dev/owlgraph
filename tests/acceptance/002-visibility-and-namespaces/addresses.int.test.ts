// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, inject, it } from 'vitest';
import type { SessionUser } from '#lib/features/auth/server.ts';
import { createCollection, getCollection, renameCollection } from '#lib/features/collections/server.ts';
import { createLinkDocument, getDocument, renameDocument } from '#lib/features/documents/server.ts';
import { createNamespace, deleteNamespace, getDefaultNamespace, listNamespaces, renameNamespace } from '#lib/features/namespaces/server.ts';
import { setNodeNamespace, userCanReadNode, type NodeAccessRow } from '#lib/features/nodes/server.ts';
import { createPage, getPage, renamePage } from '#lib/features/pages/server.ts';
import { db } from '#lib/platform/db.server.ts';
import { userOf } from '#tests/integration/users.ts';

// The names an address may take, and what deleting a namespace does to its
// nodes' addresses (docs/features/002-visibility-and-namespaces.md,
// "Acceptance criteria").

const seed = inject('seed');

type Kind = 'page' | 'document' | 'collection';
const KINDS: Kind[] = ['page', 'document', 'collection'];

let admin: SessionUser;
beforeAll(async () => {
  admin = await userOf('admin');
});

let made = 0;
async function make(kind: Kind, namespaceId?: string): Promise<string> {
  const title = `A ${kind} ${++made}`;
  if (kind === 'page') return (await createPage(title, admin, { namespaceId })).id;
  if (kind === 'document') return (await createLinkDocument({ url: 'https://example.org/file', title, createdBy: admin.id, user: admin, namespaceId })).id;
  return (await createCollection({ title, createdBy: admin.id, user: admin, namespaceId })).id;
}
const rename = (kind: Kind, id: string, slug: string) => (kind === 'page' ? renamePage(id, { slug }) : kind === 'document' ? renameDocument(id, { slug }) : renameCollection(id, { slug }));
const node = async (kind: Kind, id: string) => (kind === 'page' ? await getPage(id) : kind === 'document' ? await getDocument(id) : await getCollection(id))!;

const accessRow = async (id: string): Promise<NodeAccessRow> =>
  (
    await db<NodeAccessRow[]>`
      select n.id, n.visibility, n.created_by, n.namespace_id, ns.access_level as namespace_access_level
      from nodes n join namespaces ns on ns.id = n.namespace_id where n.id = ${id}`
  )[0];
const storedVisibility = async (id: string) => (await db<{ visibility: string | null }[]>`select visibility from nodes where id = ${id}`)[0].visibility;

describe('the names an address may take', () => {
  it('002.18 a slug or a namespace name equal to one of the app’s own addresses is refused — for every top-level route there is', async () => {
    // Every first segment the app answers itself: the folders of src/routes that are no parameter.
    const own = readdirSync(join(process.cwd(), 'src', 'routes'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !/^[[(+]/.test(entry.name))
      .map((entry) => entry.name);
    expect(own).toEqual(expect.arrayContaining(['api', 'login', 'search', 'settings']));

    const nodes = await Promise.all(KINDS.map(async (kind) => ({ kind, id: await make(kind) })));
    const before = await Promise.all(nodes.map(async ({ kind, id }) => (await node(kind, id)).slug));
    for (const word of own) {
      for (const { kind, id } of nodes) {
        await expect(rename(kind, id, word), `a ${kind} renamed to ${word}`).rejects.toMatchObject({ code: expect.stringMatching(/^slug_(reserved|required)$/) });
      }
      await expect(createNamespace({ name: word, slug: word, accessLevel: 'internal' }), `a namespace named ${word}`).rejects.toMatchObject({
        code: expect.stringMatching(/^namespace_slug_(reserved|required)$/),
      });
    }
    expect(await Promise.all(nodes.map(async ({ kind, id }) => (await node(kind, id)).slug))).toEqual(before);
    expect((await listNamespaces()).map((ns) => ns.slug).filter((slug) => slug !== null && own.includes(slug))).toEqual([]);
  });

  it('002.18 a namespace name equal to a root node’s slug is refused, and a root node’s slug equal to a namespace name, by rename and by move', async () => {
    const root = (await getDefaultNamespace()).id;
    const guild = await createNamespace({ name: 'Guild', slug: 'guild', accessLevel: 'internal' });
    const elsewhere = await createNamespace({ name: 'Elsewhere', slug: 'elsewhere', accessLevel: 'internal' });
    for (const kind of KINDS) {
      const atRoot = await make(kind);
      const { slug } = await node(kind, atRoot);
      // A namespace may not take the root node's slug, made or renamed.
      await expect(createNamespace({ name: 'Clash', slug, accessLevel: 'internal' }), `a namespace named as a root ${kind}`).rejects.toMatchObject({ code: 'namespace_slug_taken' });
      await expect(renameNamespace(elsewhere.id, { slug }), `a namespace renamed to a root ${kind}'s slug`).rejects.toMatchObject({ code: 'namespace_slug_taken' });
      // The other way round: a root node may not take a namespace's name.
      await expect(rename(kind, atRoot, 'guild'), `a root ${kind} renamed to a namespace's name`).rejects.toMatchObject({ code: 'slug_reserved' });
      expect((await node(kind, atRoot)).slug).toBe(slug);
      // Nor arrive at the root under it: inside another namespace the name is free.
      const inside = await make(kind, elsewhere.id);
      await rename(kind, inside, 'guild');
      await expect(setNodeNamespace(inside, root, admin), `a ${kind} named as a namespace, moved to the root`).rejects.toMatchObject({ code: 'slug_reserved' });
      expect((await node(kind, inside)).namespace_id).toBe(elsewhere.id);
      await rename(kind, inside, `guild-${kind}`);
    }
    expect((await listNamespaces()).map((ns) => ns.slug)).toEqual(expect.arrayContaining([guild.slug, elsewhere.slug]));
  });

  describe('a namespace deleted while one of its nodes is named as another namespace', () => {
    /** The page's slug at the root, after its namespace is deleted. */
    let slugAtRoot: string;
    beforeAll(async () => {
      await createNamespace({ name: 'Harbour', slug: 'harbour', accessLevel: 'internal' });
      const leaving = await createNamespace({ name: 'Leaving with a name', slug: 'leaving-with-a-name', accessLevel: 'internal' });
      const page = await make('page', leaving.id);
      await renamePage(page, { slug: 'harbour' });
      await deleteNamespace(leaving.id);
      const moved = (await getPage(page))!;
      expect(moved.namespace_id).toBe((await getDefaultNamespace()).id);
      slugAtRoot = moved.slug;
    });

    // Today the node keeps its slug: only a slug another root node holds gets a
    // suffix, so the page stands at /harbour beside the namespace, and its
    // /harbour/edit leads into the namespace
    // (namespaces/namespaces.server.ts, deleteNamespace).
    it.fails('002.18 deleting a namespace leaves no root node under another namespace’s name', () => {
      expect(slugAtRoot).not.toBe('harbour');
    });
  });
});

describe('a namespace deleted', () => {
  it('002.19 deleting a namespace keeps its content: its nodes move to the default namespace, a slug taken there gets a suffix, and the default namespace itself is refused', async () => {
    const ns = await createNamespace({ name: 'Leaving', slug: 'leaving', accessLevel: 'restricted' });
    const collides = await createPage('Collides', admin, { namespaceId: ns.id });
    await db`update nodes set slug = ${seed.publicSlug} where id = ${collides.id}`;
    const inheriting = await createPage('Inheriting', admin, { namespaceId: ns.id });
    expect(await userCanReadNode(await userOf('viewer'), await accessRow(inheriting.id), 'page')).toBe(false);

    await deleteNamespace(ns.id);
    const defaultNs = await getDefaultNamespace();
    const moved = await db<{ id: string; namespace_id: string; slug: string }[]>`select id, namespace_id, slug from nodes where id in ${db([collides.id, inheriting.id])}`;
    expect(moved.every((n) => n.namespace_id === defaultNs.id)).toBe(true);
    expect(moved.find((n) => n.id === collides.id)!.slug).toBe(`${seed.publicSlug}-${collides.id.slice(0, 6)}`);
    expect(await storedVisibility(inheriting.id)).toBeNull();
    expect(await userCanReadNode(await userOf('viewer'), await accessRow(inheriting.id), 'page')).toBe(true);

    await expect(deleteNamespace(defaultNs.id)).rejects.toThrow(/default namespace cannot be deleted/);
  });
});
