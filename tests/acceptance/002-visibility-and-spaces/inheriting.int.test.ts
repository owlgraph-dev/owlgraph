// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { beforeAll, describe, expect, it } from 'vitest';
import type { SessionUser } from '#lib/features/auth/server.ts';
import { createCollection, getCollection, userCanReadCollection } from '#lib/features/collections/server.ts';
import { createLinkDocument, getDocument, userCanReadDocument } from '#lib/features/documents/server.ts';
import { createSpace, deleteSpace, getDefaultSpace, setSpaceAccessLevel, setSpaceMembers } from '#lib/features/spaces/server.ts';
import type { Visibility } from '#lib/features/nodes/index.ts';
import { setNodeSpace, setNodeVisibility } from '#lib/features/nodes/server.ts';
import { createPage, getPage, userCanReadPage } from '#lib/features/pages/server.ts';
import { userOf } from '#tests/integration/users.ts';

// Inheriting and narrowing (docs/features/002-visibility-and-spaces.md,
// "Acceptance criteria"), on spaces and nodes of each test's own. Every
// node is the admin's, so the askers are a visitor, a viewer who is signed in
// and nothing more, and a member of the space.

type Kind = 'page' | 'document' | 'collection';
type Asker = 'visitor' | 'viewer' | 'member';
const KINDS: Kind[] = ['page', 'document', 'collection'];
const ASKERS: Asker[] = ['visitor', 'viewer', 'member'];

let admin: SessionUser;
const askers = {} as Record<Asker, SessionUser | null>;

beforeAll(async () => {
  admin = await userOf('admin');
  Object.assign(askers, { visitor: null, viewer: await userOf('viewer'), member: await userOf('editorC') });
});

let made = 0;
/** A space of the test's own at `accessLevel`, the member in it. */
async function space(accessLevel: Visibility): Promise<string> {
  const { id } = await createSpace({ name: `Space ${++made}`, slug: `space-${made}`, accessLevel });
  await setSpaceMembers(id, [askers.member!.id]);
  return id;
}

/** A node of the admin's in a space; `visibility` asks for a level when it is made, which a document cannot. */
async function make(kind: Kind, spaceId: string, visibility?: Visibility): Promise<string> {
  const title = `A ${kind} ${++made}`;
  if (kind === 'page') return (await createPage(title, admin, { spaceId, visibility })).id;
  if (kind === 'collection') return (await createCollection({ title, createdBy: admin.id, user: admin, spaceId, visibility })).id;
  const { id } = await createLinkDocument({ url: 'https://example.org/file', title, createdBy: admin.id, user: admin, spaceId });
  if (visibility) await setNodeVisibility(id, visibility);
  return id;
}

const row = async (kind: Kind, id: string) => (kind === 'page' ? getPage(id) : kind === 'document' ? getDocument(id) : getCollection(id));

async function reads(kind: Kind, id: string, user: SessionUser | null): Promise<boolean> {
  if (kind === 'page') return userCanReadPage(user, (await getPage(id))!);
  if (kind === 'document') return userCanReadDocument(user, (await getDocument(id))!);
  return userCanReadCollection(user, (await getCollection(id))!);
}

/** Which of the three askers read the node. */
async function readersOf(kind: Kind, id: string): Promise<Asker[]> {
  const out: Asker[] = [];
  for (const asker of ASKERS) if (await reads(kind, id, askers[asker])) out.push(asker);
  return out;
}

describe('inheriting and narrowing', () => {
  it('002.7 a node with no visibility of its own is read as its space’s level allows, and a change of that level changes its readers while the node stays as it was', async () => {
    const ns = await space('public');
    for (const kind of KINDS) {
      const id = await make(kind, ns);
      const before = await row(kind, id);
      expect(await readersOf(kind, id), `a ${kind} in a public space`).toEqual(['visitor', 'viewer', 'member']);
      await setSpaceAccessLevel(ns, 'internal');
      expect(await readersOf(kind, id), `a ${kind}, the space now internal`).toEqual(['viewer', 'member']);
      await setSpaceAccessLevel(ns, 'restricted');
      expect(await readersOf(kind, id), `a ${kind}, the space now restricted`).toEqual(['member']);
      await setSpaceAccessLevel(ns, 'public');
      expect(await readersOf(kind, id), `a ${kind}, the space public again`).toEqual(['visitor', 'viewer', 'member']);
      expect(await row(kind, id), `the ${kind} itself`).toEqual(before);
    }
  });

  it('002.8 a node cannot be set more open than its space, when it is made or afterwards', async () => {
    const refused = { code: 'widening_not_allowed' };
    const cases: { level: Visibility; wider: Visibility[]; readers: Asker[] }[] = [
      { level: 'internal', wider: ['public'], readers: ['viewer', 'member'] },
      { level: 'restricted', wider: ['public', 'internal'], readers: ['member'] },
    ];
    for (const { level, wider, readers } of cases) {
      const ns = await space(level);
      for (const kind of KINDS) {
        const id = await make(kind, ns);
        for (const asked of wider) {
          await expect(setNodeVisibility(id, asked), `a ${kind} in a ${level} space, asked to be ${asked}`).rejects.toMatchObject(refused);
          // A document is made without a level of its own, so it has no such case.
          if (kind !== 'document') await expect(make(kind, ns, asked), `a ${kind} made ${asked} in a ${level} space`).rejects.toMatchObject(refused);
        }
        expect(await readersOf(kind, id), `the ${kind} in the ${level} space, after the refusals`).toEqual(readers);
      }
    }
  });

  it('002.8 a node asked to be public keeps no setting of its own and goes on inheriting', async () => {
    const ns = await space('public');
    const nodes: [Kind, string][] = [];
    for (const kind of KINDS) {
      const id = await make(kind, ns, 'internal');
      expect(await readersOf(kind, id), `a ${kind} set to internal`).toEqual(['viewer', 'member']);
      expect(await setNodeVisibility(id, 'public'), `the setting a ${kind} keeps, asked to be public`).toBeNull();
      expect(await readersOf(kind, id), `the ${kind}, asked to be public`).toEqual(['visitor', 'viewer', 'member']);
      nodes.push([kind, id]);
    }
    // A setting of its own would be narrowed with the space and stay
    // behind when the space opens again: these follow it both ways.
    await setSpaceAccessLevel(ns, 'restricted');
    for (const [kind, id] of nodes) expect(await readersOf(kind, id), `the ${kind}, the space now restricted`).toEqual(['member']);
    await setSpaceAccessLevel(ns, 'public');
    for (const [kind, id] of nodes) expect(await readersOf(kind, id), `the ${kind}, the space public again`).toEqual(['visitor', 'viewer', 'member']);
  });

  it('002.9 lowering a space’s level narrows every setting that would be too open, and succeeds', async () => {
    const ns = await space('public');
    // Of each type one node that inherits, one set to internal, and — where a
    // node can be made so — one whose setting is public.
    const all: [Kind, string][] = [];
    for (const kind of KINDS) {
      all.push([kind, await make(kind, ns)], [kind, await make(kind, ns, 'internal')]);
      if (kind !== 'document') all.push([kind, await make(kind, ns, 'public')]);
    }
    await expect(setSpaceAccessLevel(ns, 'internal')).resolves.toBeUndefined();
    for (const [kind, id] of all) expect(await reads(kind, id, null), `a visitor and a ${kind}, the space now internal`).toBe(false);
    await expect(setSpaceAccessLevel(ns, 'restricted')).resolves.toBeUndefined();
    for (const [kind, id] of all) expect(await reads(kind, id, askers.viewer), `a viewer and a ${kind}, the space now restricted`).toBe(false);
  });

  it('002.9 moving a node into a closer space narrows its setting, and succeeds', async () => {
    const open = await space('public');
    const closer = await space('internal');
    const closest = await space('restricted');
    for (const kind of KINDS) {
      // A document cannot be made with a public setting; it starts from internal.
      const id = await make(kind, open, kind === 'document' ? 'internal' : 'public');
      await expect(setNodeSpace(id, closer, admin)).resolves.toBeUndefined();
      expect(await readersOf(kind, id), `a ${kind} moved into an internal space`).toEqual(['viewer', 'member']);
      await expect(setNodeSpace(id, closest, admin)).resolves.toBeUndefined();
      expect(await reads(kind, id, askers.viewer), `a viewer and the ${kind}, moved into a restricted space`).toBe(false);
      expect(await reads(kind, id, null), `a visitor and the ${kind}, moved into a restricted space`).toBe(false);
    }
  });

  it('002.9 deleting a space narrows the settings of the nodes it moves into a closer default space, and succeeds', async () => {
    const defaultSpace = (await getDefaultSpace()).id;
    const leaving = await space('internal');
    const nodes: [Kind, string][] = [];
    for (const kind of KINDS) {
      const id = await make(kind, leaving, 'internal');
      expect(await reads(kind, id, askers.viewer), `a viewer and the ${kind} set to internal`).toBe(true);
      nodes.push([kind, id]);
    }
    await setSpaceAccessLevel(defaultSpace, 'restricted');
    try {
      await expect(deleteSpace(leaving)).resolves.toBeUndefined();
      for (const [kind, id] of nodes) {
        expect((await row(kind, id))!.space_id, `the ${kind}'s space`).toBe(defaultSpace);
        expect(await reads(kind, id, askers.viewer), `a viewer and the ${kind}, now in the restricted default space`).toBe(false);
      }
    } finally {
      // As the suite's seed has it (tests/support/seed.ts).
      await setSpaceAccessLevel(defaultSpace, 'public');
    }
  });
});
