// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, inject, it } from 'vitest';
import { db } from '$lib/platform/db.server';
import { createLinkDocument } from '$lib/features/documents/server';
import { createPage, userCanWritePage } from '$lib/features/pages/server';
import { setNodeVisibility, userCanReadNode, type NodeAccessRow } from '$lib/features/nodes/server';
import { userOf } from '$tests/integration/users';
import {
  createNamespace,
  deleteNamespace,
  getDefaultNamespace,
  listNamespaces,
  renameNamespace,
  setNamespaceAccessLevel,
  setNamespaceMembers,
} from './server';

const seed = inject('seed');

const accessRow = async (id: string): Promise<NodeAccessRow> =>
  (
    await db<NodeAccessRow[]>`
      select n.id, n.visibility, n.created_by, n.namespace_id, ns.access_level as namespace_access_level
      from nodes n join namespaces ns on ns.id = n.namespace_id where n.id = ${id}`
  )[0];
const anonymousReads = async (id: string) => userCanReadNode(null, await accessRow(id), 'document');
const storedVisibility = async (id: string) => (await db<{ visibility: string | null }[]>`select visibility from nodes where id = ${id}`)[0].visibility;
const levelOf = async (id: string) => (await listNamespaces()).find((ns) => ns.id === id)?.access_level;

describe('a namespace as an admin manages it', () => {
  it('a new access level is stored, and the namespace list answers it', async () => {
    const ns = await createNamespace({ name: 'Level change', slug: 'level-change', accessLevel: 'internal' });
    await setNamespaceAccessLevel(ns.id, 'public');
    expect(await levelOf(ns.id)).toBe('public');
  });

  it('a deleted namespace is no longer in the list', async () => {
    const ns = await createNamespace({ name: 'To delete', slug: 'to-delete', accessLevel: 'internal' });
    await deleteNamespace(ns.id);
    expect((await listNamespaces()).map((n) => n.id)).not.toContain(ns.id);
  });

  it('a prefix reserved for a built-in route, another namespace’s, or a page’s slug at the site root is refused, on create and on rename', async () => {
    const taken = await createNamespace({ name: 'Taken', slug: 'taken-prefix', accessLevel: 'internal' });
    const refusals = { settings: 'namespace_slug_reserved', 'taken-prefix': 'namespace_slug_taken', [seed.publicSlug]: 'namespace_slug_taken' };
    const other = await createNamespace({ name: 'Renamed', slug: 'renamed-prefix', accessLevel: 'internal' });
    for (const [slug, code] of Object.entries(refusals)) {
      await expect(createNamespace({ name: `Try ${slug}`, slug, accessLevel: 'internal' }), `create ${slug}`).rejects.toMatchObject({ code });
      await expect(renameNamespace(other.id, { slug }), `rename to ${slug}`).rejects.toMatchObject({ code });
    }
    expect((await listNamespaces()).find((n) => n.id === taken.id)?.slug).toBe('taken-prefix');
  });

  it('deleting one keeps its content: nodes move into the default namespace, a colliding slug gets a suffix, an inheriting node takes the default’s level; the default namespace itself is refused', async () => {
    const admin = await userOf('admin');
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

describe('the access a namespace gives its content', () => {
  it('a document new in an internal namespace inherits it: an anonymous reader may not read it', async () => {
    const ns = await createNamespace({ name: 'Internal docs', slug: 'internal-docs', accessLevel: 'internal' });
    const admin = await userOf('admin');
    const doc = await createLinkDocument({ url: 'https://example.org/a', title: 'Internal doc', createdBy: admin.id, user: admin, namespaceId: ns.id });
    expect(await storedVisibility(doc.id)).toBeNull();
    expect(await anonymousReads(doc.id)).toBe(false);
  });

  it('a document new in a public namespace inherits it: an anonymous reader may read it', async () => {
    const ns = await createNamespace({ name: 'Public docs', slug: 'public-docs', accessLevel: 'public' });
    const admin = await userOf('admin');
    const doc = await createLinkDocument({ url: 'https://example.org/b', title: 'Public doc', createdBy: admin.id, user: admin, namespaceId: ns.id });
    expect(await anonymousReads(doc.id)).toBe(true);
  });

  it('a public level asked for a node is stored as inherit in a public namespace, refused in an internal one, and no level resets an override', async () => {
    const admin = await userOf('admin');
    const open = await createNamespace({ name: 'Open', slug: 'open-ns', accessLevel: 'public' });
    const closed = await createNamespace({ name: 'Closed', slug: 'closed-ns', accessLevel: 'internal' });
    const inOpen = await createPage('In open', admin, { namespaceId: open.id });
    const inClosed = await createPage('In closed', admin, { namespaceId: closed.id });

    expect(await setNodeVisibility(inOpen.id, 'public')).toBeNull();
    expect(await storedVisibility(inOpen.id)).toBeNull();

    await expect(setNodeVisibility(inClosed.id, 'public')).rejects.toMatchObject({ code: 'widening_not_allowed' });
    await setNodeVisibility(inClosed.id, 'restricted');
    expect(await storedVisibility(inClosed.id)).toBe('restricted');
    expect(await setNodeVisibility(inClosed.id, null)).toBeNull();
    expect(await storedVisibility(inClosed.id)).toBeNull();
  });

  it('a member of a restricted namespace who does not own a page inheriting it reads and writes it; an editor who is no member does neither', async () => {
    const [admin, editorB, editorC] = [await userOf('admin'), await userOf('editorB'), await userOf('editorC')];
    const ns = await createNamespace({ name: 'Members write', slug: 'members-write', accessLevel: 'restricted' });
    await setNamespaceMembers(ns.id, [editorB.id]);
    const page = await accessRow((await createPage('Members page', admin, { namespaceId: ns.id })).id);
    expect(page.visibility).toBeNull();

    expect(await userCanReadNode(editorB, page, 'page')).toBe(true);
    expect(await userCanWritePage(editorB, page)).toBe(true);
    expect(await userCanReadNode(editorC, page, 'page')).toBe(false);
    expect(await userCanWritePage(editorC, page)).toBe(false);
  });
});
