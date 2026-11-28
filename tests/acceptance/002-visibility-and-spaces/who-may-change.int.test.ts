// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { beforeAll, describe, expect, it } from 'vitest';
import type { SessionUser } from '#lib/features/auth/server.ts';
import { createCollection, getCollection, renameCollection, userCanReadCollection, userCanWriteCollection } from '#lib/features/collections/server.ts';
import { createLinkDocument, getDocument, renameDocument, userCanReadDocument, userCanWriteDocument } from '#lib/features/documents/server.ts';
import { createSpace, getDefaultSpace, setSpaceMembers } from '#lib/features/spaces/server.ts';
import { setNodeShares, setNodeSpace, setNodeVisibility } from '#lib/features/nodes/server.ts';
import { createPage, getPage, renamePage, userCanReadPage, userCanWritePage } from '#lib/features/pages/server.ts';
import { userOf } from '#tests/integration/users.ts';

// Who may change a node, and who may place one in a restricted space
// (docs/features/002-visibility-and-spaces.md, "Acceptance criteria").

type Kind = 'page' | 'document' | 'collection';
type Asker = 'viewer' | 'owner' | 'shared' | 'member' | 'admin';
const KINDS: Kind[] = ['page', 'document', 'collection'];
const ASKERS: Asker[] = ['viewer', 'owner', 'shared', 'member', 'admin'];

/** `owner` made every node of the first test, `shared` is on a share list, `member` is in the restricted space; `owner` and `shared` are editors outside it. */
const askers = {} as Record<Asker, SessionUser>;
let restricted: string;

beforeAll(async () => {
  Object.assign(askers, {
    viewer: await userOf('viewer'),
    owner: await userOf('editorA'),
    shared: await userOf('editorB'),
    member: await userOf('editorC'),
    admin: await userOf('admin'),
  });
  restricted = (await createSpace({ name: 'Members only', slug: 'members-only', accessLevel: 'restricted' })).id;
  await setSpaceMembers(restricted, [askers.member.id]);
});

let made = 0;
async function make(kind: Kind, by: SessionUser, spaceId?: string): Promise<string> {
  const title = `A ${kind} ${++made}`;
  if (kind === 'page') return (await createPage(title, by, { spaceId })).id;
  if (kind === 'document') return (await createLinkDocument({ url: 'https://example.org/file', title, createdBy: by.id, user: by, spaceId })).id;
  return (await createCollection({ title, createdBy: by.id, user: by, spaceId })).id;
}

async function may(what: 'read' | 'write', kind: Kind, id: string, user: SessionUser): Promise<boolean> {
  if (kind === 'page') {
    const page = (await getPage(id))!;
    return what === 'read' ? userCanReadPage(user, page) : userCanWritePage(user, page);
  }
  if (kind === 'document') {
    const document = (await getDocument(id))!;
    return what === 'read' ? userCanReadDocument(user, document) : userCanWriteDocument(user, document);
  }
  const collection = (await getCollection(id))!;
  return what === 'read' ? userCanReadCollection(user, collection) : userCanWriteCollection(user, collection);
}

const rowOf = async (kind: Kind, id: string) => (kind === 'page' ? await getPage(id) : kind === 'document' ? await getDocument(id) : await getCollection(id))!;
const spaceOf = async (kind: Kind, id: string) => (await rowOf(kind, id)).space_id;
const renamed = (kind: Kind, id: string, slug: string) => (kind === 'page' ? renamePage : kind === 'document' ? renameDocument : renameCollection)(id, { slug });

describe('who may change a node', () => {
  it('002.12 a viewer changes no node; an editor changes any node they may read, a document they did not make included', async () => {
    // Of each type: a public node, an internal one, one restricted by itself
    // and shared, and one that inherits the restricted space. All the owner's.
    await setSpaceMembers(restricted, [askers.owner.id, askers.member.id]);
    const nodes = {} as Record<Kind, Record<'open' | 'internal' | 'own' | 'inheriting', string>>;
    for (const kind of KINDS) {
      const internal = await make(kind, askers.owner);
      await setNodeVisibility(internal, 'internal');
      const own = await make(kind, askers.owner);
      await setNodeVisibility(own, 'restricted');
      await setNodeShares(own, [askers.shared.id]);
      nodes[kind] = { open: await make(kind, askers.owner), internal, own, inheriting: await make(kind, askers.owner, restricted) };
    }
    await setSpaceMembers(restricted, [askers.member.id]);

    const writersOf = async (kind: Kind, id: string) => {
      const out: Asker[] = [];
      for (const asker of ASKERS) if (await may('write', kind, id, askers[asker])) out.push(asker);
      return out;
    };
    for (const kind of KINDS) {
      for (const [name, id] of Object.entries(nodes[kind])) {
        const writers = await writersOf(kind, id);
        expect(writers, `a viewer and the ${name} ${kind}`).not.toContain('viewer');
        expect(writers, `an admin and the ${name} ${kind}`).toContain('admin');
        for (const editor of ['owner', 'shared', 'member'] as const) {
          expect(writers.includes(editor), `the ${editor}, an editor, changes the ${name} ${kind} exactly when they read it`).toBe(await may('read', kind, id, askers[editor]));
        }
      }
    }
    // Not every editor reads every one of them: the rule was not met by all reading all.
    for (const kind of KINDS) {
      expect(await writersOf(kind, nodes[kind].open), `the open ${kind}`).toEqual(['owner', 'shared', 'member', 'admin']);
      expect(await writersOf(kind, nodes[kind].own), `the ${kind} restricted by itself`).toEqual(['owner', 'shared', 'admin']);
      expect(await writersOf(kind, nodes[kind].inheriting), `the inheriting ${kind}`).toEqual(['owner', 'member', 'admin']);
    }
  });

  it('002.13 making a node in a restricted space, or moving one into it, is refused to an editor who is no member, and open to a member and to an admin', async () => {
    const refused = { code: 'space_membership_required' };
    const elsewhere = (await getDefaultSpace()).id;
    for (const kind of KINDS) {
      await expect(make(kind, askers.shared, restricted), `an editor who is no member, making a ${kind}`).rejects.toMatchObject(refused);
      // Its slug is taken there, which is not theirs to learn: the refusal is the same.
      const outside = await make(kind, askers.shared);
      await renamed(kind, outside, (await rowOf(kind, await make(kind, askers.member, restricted))).slug);
      await expect(setNodeSpace(outside, restricted, askers.shared), `an editor who is no member, moving a ${kind} in`).rejects.toMatchObject(refused);
      expect(await spaceOf(kind, outside), `the ${kind} they could not move`).toBe(elsewhere);

      for (const allowed of ['member', 'admin'] as const) {
        expect(await spaceOf(kind, await make(kind, askers[allowed], restricted)), `a ${kind} the ${allowed} makes there`).toBe(restricted);
        const moved = await make(kind, askers[allowed]);
        await setNodeSpace(moved, restricted, askers[allowed]);
        expect(await spaceOf(kind, moved), `a ${kind} the ${allowed} moves in`).toBe(restricted);
      }
    }
  });
});
