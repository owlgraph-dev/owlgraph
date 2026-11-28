// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, inject, it } from 'vitest';
import type { SessionUser } from '#lib/features/auth/server.ts';
import { createCollection, getCollection, renameCollection } from '#lib/features/collections/server.ts';
import { createLinkDocument, getDocument, renameDocument } from '#lib/features/documents/server.ts';
import { createSpace, deleteSpace, getDefaultSpace, listSpaces, renameSpace } from '#lib/features/spaces/server.ts';
import { setNodeSpace, userCanReadNode, type NodeAccessRow } from '#lib/features/nodes/server.ts';
import { createPage, getPage, renamePage } from '#lib/features/pages/server.ts';
import { db } from '#lib/platform/db.server.ts';
import { userOf } from '#tests/integration/users.ts';

// The names an address may take, and what deleting a space does to its
// nodes' addresses (docs/features/002-visibility-and-spaces.md,
// "Acceptance criteria").

const seed = inject('seed');

type Kind = 'page' | 'document' | 'collection';
const KINDS: Kind[] = ['page', 'document', 'collection'];

let admin: SessionUser;
beforeAll(async () => {
  admin = await userOf('admin');
});

let made = 0;
async function make(kind: Kind, spaceId?: string): Promise<string> {
  const title = `A ${kind} ${++made}`;
  if (kind === 'page') return (await createPage(title, admin, { spaceId })).id;
  if (kind === 'document') return (await createLinkDocument({ url: 'https://example.org/file', title, createdBy: admin.id, user: admin, spaceId })).id;
  return (await createCollection({ title, createdBy: admin.id, user: admin, spaceId })).id;
}
const rename = (kind: Kind, id: string, slug: string) => (kind === 'page' ? renamePage(id, { slug }) : kind === 'document' ? renameDocument(id, { slug }) : renameCollection(id, { slug }));
const node = async (kind: Kind, id: string) => (kind === 'page' ? await getPage(id) : kind === 'document' ? await getDocument(id) : await getCollection(id))!;

const accessRow = async (id: string): Promise<NodeAccessRow> =>
  (
    await db<NodeAccessRow[]>`
      select n.id, n.visibility, n.created_by, n.space_id, ns.access_level as space_access_level
      from nodes n join spaces ns on ns.id = n.space_id where n.id = ${id}`
  )[0];
const storedVisibility = async (id: string) => (await db<{ visibility: string | null }[]>`select visibility from nodes where id = ${id}`)[0].visibility;

describe('the names an address may take', () => {
  it('002.18 a slug or a space name equal to one of the app’s own addresses is refused — for every top-level route there is', async () => {
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
      await expect(createSpace({ name: word, slug: word, accessLevel: 'internal' }), `a space named ${word}`).rejects.toMatchObject({
        code: expect.stringMatching(/^space_slug_(reserved|required)$/),
      });
    }
    expect(await Promise.all(nodes.map(async ({ kind, id }) => (await node(kind, id)).slug))).toEqual(before);
    expect((await listSpaces()).map((ns) => ns.slug).filter((slug) => slug !== null && own.includes(slug))).toEqual([]);
  });

  it('002.18 a space name equal to a root node’s slug is refused, and a root node’s slug equal to a space name, by rename and by move', async () => {
    const root = (await getDefaultSpace()).id;
    const guild = await createSpace({ name: 'Guild', slug: 'guild', accessLevel: 'internal' });
    const elsewhere = await createSpace({ name: 'Elsewhere', slug: 'elsewhere', accessLevel: 'internal' });
    for (const kind of KINDS) {
      const atRoot = await make(kind);
      const { slug } = await node(kind, atRoot);
      // A space may not take the root node's slug, made or renamed.
      await expect(createSpace({ name: 'Clash', slug, accessLevel: 'internal' }), `a space named as a root ${kind}`).rejects.toMatchObject({ code: 'space_slug_taken' });
      await expect(renameSpace(elsewhere.id, { slug }), `a space renamed to a root ${kind}'s slug`).rejects.toMatchObject({ code: 'space_slug_taken' });
      // The other way round: a root node may not take a space's name.
      await expect(rename(kind, atRoot, 'guild'), `a root ${kind} renamed to a space's name`).rejects.toMatchObject({ code: 'slug_reserved' });
      expect((await node(kind, atRoot)).slug).toBe(slug);
      // Nor arrive at the root under it: inside another space the name is free.
      const inside = await make(kind, elsewhere.id);
      await rename(kind, inside, 'guild');
      await expect(setNodeSpace(inside, root, admin), `a ${kind} named as a space, moved to the root`).rejects.toMatchObject({ code: 'slug_reserved' });
      expect((await node(kind, inside)).space_id).toBe(elsewhere.id);
      await rename(kind, inside, `guild-${kind}`);
    }
    expect((await listSpaces()).map((ns) => ns.slug)).toEqual(expect.arrayContaining([guild.slug, elsewhere.slug]));
  });

  describe('a space deleted while one of its nodes is named as another space', () => {
    /** The page's slug at the root, after its space is deleted. */
    let slugAtRoot: string;
    beforeAll(async () => {
      await createSpace({ name: 'Harbour', slug: 'harbour', accessLevel: 'internal' });
      const leaving = await createSpace({ name: 'Leaving with a name', slug: 'leaving-with-a-name', accessLevel: 'internal' });
      const page = await make('page', leaving.id);
      await renamePage(page, { slug: 'harbour' });
      await deleteSpace(leaving.id);
      const moved = (await getPage(page))!;
      expect(moved.space_id).toBe((await getDefaultSpace()).id);
      slugAtRoot = moved.slug;
    });

    // Today the node keeps its slug: only a slug another root node holds gets a
    // suffix, so the page stands at /harbour beside the space, and its
    // /harbour/edit leads into the space
    // (spaces/spaces.server.ts, deleteSpace).
    it.fails('002.18 deleting a space leaves no root node under another space’s name', () => {
      expect(slugAtRoot).not.toBe('harbour');
    });
  });
});

describe('a space deleted', () => {
  it('002.19 deleting a space keeps its content: its nodes move to the default space, a slug taken there gets a suffix, and the default space itself is refused', async () => {
    const ns = await createSpace({ name: 'Leaving', slug: 'leaving', accessLevel: 'restricted' });
    const collides = await createPage('Collides', admin, { spaceId: ns.id });
    await db`update nodes set slug = ${seed.publicSlug} where id = ${collides.id}`;
    const inheriting = await createPage('Inheriting', admin, { spaceId: ns.id });
    expect(await userCanReadNode(await userOf('viewer'), await accessRow(inheriting.id), 'page')).toBe(false);

    await deleteSpace(ns.id);
    const defaultNs = await getDefaultSpace();
    const moved = await db<{ id: string; space_id: string; slug: string }[]>`select id, space_id, slug from nodes where id in ${db([collides.id, inheriting.id])}`;
    expect(moved.every((n) => n.space_id === defaultNs.id)).toBe(true);
    expect(moved.find((n) => n.id === collides.id)!.slug).toBe(`${seed.publicSlug}-${collides.id.slice(0, 6)}`);
    expect(await storedVisibility(inheriting.id)).toBeNull();
    expect(await userCanReadNode(await userOf('viewer'), await accessRow(inheriting.id), 'page')).toBe(true);

    await expect(deleteSpace(defaultNs.id)).rejects.toThrow(/default space cannot be deleted/);
  });
});
