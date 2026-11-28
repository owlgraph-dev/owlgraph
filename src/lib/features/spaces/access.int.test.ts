// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, inject, it } from 'vitest';
import { db } from '#lib/platform/db.server.ts';
import { createLinkDocument } from '#lib/features/documents/server.ts';
import { createPage, userCanWritePage } from '#lib/features/pages/server.ts';
import { setNodeVisibility, userCanReadNode, type NodeAccessRow } from '#lib/features/nodes/server.ts';
import { userOf } from '#tests/integration/users.ts';
import {
  createSpace,
  deleteSpace,
  listSpaces,
  renameSpace,
  setSpaceAccessLevel,
  setSpaceMembers,
} from './server';

const seed = inject('seed');

const accessRow = async (id: string): Promise<NodeAccessRow> =>
  (
    await db<NodeAccessRow[]>`
      select n.id, n.visibility, n.created_by, n.space_id, ns.access_level as space_access_level
      from nodes n join spaces ns on ns.id = n.space_id where n.id = ${id}`
  )[0];
const anonymousReads = async (id: string) => userCanReadNode(null, await accessRow(id), 'document');
const storedVisibility = async (id: string) => (await db<{ visibility: string | null }[]>`select visibility from nodes where id = ${id}`)[0].visibility;
const levelOf = async (id: string) => (await listSpaces()).find((ns) => ns.id === id)?.access_level;

describe('a space as an admin manages it', () => {
  it('a new access level is stored, and the space list answers it', async () => {
    const ns = await createSpace({ name: 'Level change', slug: 'level-change', accessLevel: 'internal' });
    await setSpaceAccessLevel(ns.id, 'public');
    expect(await levelOf(ns.id)).toBe('public');
  });

  it('a deleted space is no longer in the list', async () => {
    const ns = await createSpace({ name: 'To delete', slug: 'to-delete', accessLevel: 'internal' });
    await deleteSpace(ns.id);
    expect((await listSpaces()).map((n) => n.id)).not.toContain(ns.id);
  });

  it('a prefix reserved for a built-in route, another space’s, or a page’s slug at the site root is refused, on create and on rename', async () => {
    const taken = await createSpace({ name: 'Taken', slug: 'taken-prefix', accessLevel: 'internal' });
    const refusals = { settings: 'space_slug_reserved', 'taken-prefix': 'space_slug_taken', [seed.publicSlug]: 'space_slug_taken' };
    const other = await createSpace({ name: 'Renamed', slug: 'renamed-prefix', accessLevel: 'internal' });
    for (const [slug, code] of Object.entries(refusals)) {
      await expect(createSpace({ name: `Try ${slug}`, slug, accessLevel: 'internal' }), `create ${slug}`).rejects.toMatchObject({ code });
      await expect(renameSpace(other.id, { slug }), `rename to ${slug}`).rejects.toMatchObject({ code });
    }
    expect((await listSpaces()).find((n) => n.id === taken.id)?.slug).toBe('taken-prefix');
  });
});

describe('the access a space gives its content', () => {
  it('a document new in an internal space inherits it: an anonymous reader may not read it', async () => {
    const ns = await createSpace({ name: 'Internal docs', slug: 'internal-docs', accessLevel: 'internal' });
    const admin = await userOf('admin');
    const doc = await createLinkDocument({ url: 'https://example.org/a', title: 'Internal doc', createdBy: admin.id, user: admin, spaceId: ns.id });
    expect(await storedVisibility(doc.id)).toBeNull();
    expect(await anonymousReads(doc.id)).toBe(false);
  });

  it('a document new in a public space inherits it: an anonymous reader may read it', async () => {
    const ns = await createSpace({ name: 'Public docs', slug: 'public-docs', accessLevel: 'public' });
    const admin = await userOf('admin');
    const doc = await createLinkDocument({ url: 'https://example.org/b', title: 'Public doc', createdBy: admin.id, user: admin, spaceId: ns.id });
    expect(await anonymousReads(doc.id)).toBe(true);
  });

  it('a public level asked for a node is stored as inherit in a public space, refused in an internal one, and no level resets an override', async () => {
    const admin = await userOf('admin');
    const open = await createSpace({ name: 'Open', slug: 'open-ns', accessLevel: 'public' });
    const closed = await createSpace({ name: 'Closed', slug: 'closed-ns', accessLevel: 'internal' });
    const inOpen = await createPage('In open', admin, { spaceId: open.id });
    const inClosed = await createPage('In closed', admin, { spaceId: closed.id });

    expect(await setNodeVisibility(inOpen.id, 'public')).toBeNull();
    expect(await storedVisibility(inOpen.id)).toBeNull();

    await expect(setNodeVisibility(inClosed.id, 'public')).rejects.toMatchObject({ code: 'widening_not_allowed' });
    await setNodeVisibility(inClosed.id, 'restricted');
    expect(await storedVisibility(inClosed.id)).toBe('restricted');
    expect(await setNodeVisibility(inClosed.id, null)).toBeNull();
    expect(await storedVisibility(inClosed.id)).toBeNull();
  });

  it('a member of a restricted space who does not own a page inheriting it reads and writes it; an editor who is no member does neither', async () => {
    const [admin, editorB, editorC] = [await userOf('admin'), await userOf('editorB'), await userOf('editorC')];
    const ns = await createSpace({ name: 'Members write', slug: 'members-write', accessLevel: 'restricted' });
    await setSpaceMembers(ns.id, [editorB.id]);
    const page = await accessRow((await createPage('Members page', admin, { spaceId: ns.id })).id);
    expect(page.visibility).toBeNull();

    expect(await userCanReadNode(editorB, page, 'page')).toBe(true);
    expect(await userCanWritePage(editorB, page)).toBe(true);
    expect(await userCanReadNode(editorC, page, 'page')).toBe(false);
    expect(await userCanWritePage(editorC, page)).toBe(false);
  });
});
