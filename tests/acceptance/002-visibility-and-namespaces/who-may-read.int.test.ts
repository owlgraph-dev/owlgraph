// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { beforeAll, describe, expect, it } from 'vitest';
import type { SessionUser } from '#lib/features/auth/server.ts';
import { createCollection, getCollection, userCanReadCollection } from '#lib/features/collections/server.ts';
import { createLinkDocument, getDocument, setDocumentShares, userCanReadDocument } from '#lib/features/documents/server.ts';
import { getGraph } from '#lib/features/graph/server.ts';
import { createNamespace, setNamespaceMembers } from '#lib/features/namespaces/server.ts';
import { setNodeVisibility } from '#lib/features/nodes/server.ts';
import { createPage, getPage, setPageShares, userCanReadPage } from '#lib/features/pages/server.ts';
import { userOf } from '#tests/integration/users.ts';

// Who may read a node of each type (docs/features/002-visibility-and-namespaces.md,
// "Acceptance criteria"). A reader reads a node when the node's own check lets
// them and the list of what they may read holds it: the two forms the rule takes.

type Kind = 'page' | 'document' | 'collection';
type Reader = 'anonymous' | 'viewer' | 'owner' | 'shared' | 'member' | 'admin';
const KINDS: Kind[] = ['page', 'document', 'collection'];
const READERS: Reader[] = ['anonymous', 'viewer', 'owner', 'shared', 'member', 'admin'];

/** The six askers: `owner` made every node, `shared` is on a share list, `member` is in the restricted namespace. */
const readers = {} as Record<Reader, SessionUser | null>;
/**
 * A node of each type: `open` inherits the public default namespace, `internal`
 * is set so; in a restricted namespace, `inheriting` has no visibility of its
 * own, `own` is set to restricted by itself and shared, `other` likewise but
 * shared with no one.
 */
const nodes = {} as Record<'open' | 'internal' | 'inheriting' | 'own' | 'other', Record<Kind, string>>;

async function make(kind: Kind, title: string, by: SessionUser, namespaceId?: string): Promise<string> {
  if (kind === 'page') return (await createPage(title, by, { namespaceId })).id;
  if (kind === 'document') return (await createLinkDocument({ url: 'https://example.org/file', title, createdBy: by.id, user: by, namespaceId })).id;
  return (await createCollection({ title, createdBy: by.id, user: by, namespaceId })).id;
}

/** Shares a node with a user; a collection has no share list, so there it shares with no one. */
async function share(kind: Kind, id: string, userId: string): Promise<void> {
  if (kind === 'page') await setPageShares(id, [userId]);
  if (kind === 'document') await setDocumentShares(id, [userId]);
}

beforeAll(async () => {
  Object.assign(readers, {
    anonymous: null,
    viewer: await userOf('viewer'),
    owner: await userOf('editorA'),
    shared: await userOf('editorB'),
    member: await userOf('editorC'),
    admin: await userOf('admin'),
  });
  const owner = readers.owner!;
  const namespace = await createNamespace({ name: 'Members only', slug: 'members-only', accessLevel: 'restricted' });
  // The owner is a member while making the nodes, and no longer afterwards.
  await setNamespaceMembers(namespace.id, [owner.id, readers.member!.id]);
  for (const name of ['open', 'internal', 'inheriting', 'own', 'other'] as const) nodes[name] = {} as Record<Kind, string>;
  for (const kind of KINDS) {
    nodes.open[kind] = await make(kind, `Open ${kind}`, owner);
    nodes.internal[kind] = await make(kind, `Internal ${kind}`, owner);
    await setNodeVisibility(nodes.internal[kind], 'internal');
    nodes.inheriting[kind] = await make(kind, `Inheriting ${kind}`, owner, namespace.id);
    nodes.own[kind] = await make(kind, `Own ${kind}`, owner, namespace.id);
    await setNodeVisibility(nodes.own[kind], 'restricted');
    await share(kind, nodes.own[kind], readers.shared!.id);
    nodes.other[kind] = await make(kind, `Other ${kind}`, owner, namespace.id);
    await setNodeVisibility(nodes.other[kind], 'restricted');
  }
  await setNamespaceMembers(namespace.id, [readers.member!.id]);
});

async function checked(kind: Kind, id: string, user: SessionUser | null): Promise<boolean> {
  if (kind === 'page') return userCanReadPage(user, (await getPage(id))!);
  if (kind === 'document') return userCanReadDocument(user, (await getDocument(id))!);
  return userCanReadCollection(user, (await getCollection(id))!);
}

/** Who of the six reads the node: by its own check and by the list, which must agree. */
async function readersOf(kind: Kind, id: string): Promise<Reader[]> {
  const out: Reader[] = [];
  for (const reader of READERS) {
    const user = readers[reader];
    const byCheck = await checked(kind, id, user);
    const listed = (await getGraph(user)).nodes.some((n) => n.id === id);
    expect(listed, `${reader} and the ${kind}: the list and the node's check agree`).toBe(byCheck);
    if (byCheck) out.push(reader);
  }
  return out;
}

describe('who may read a node', () => {
  it('002.1 an anonymous visitor reads a public page, document and collection, and none that is internal or restricted', async () => {
    for (const kind of KINDS) {
      expect(await readersOf(kind, nodes.open[kind]), `a public ${kind}`).toContain('anonymous');
      for (const closed of ['internal', 'inheriting', 'own'] as const) {
        expect(await readersOf(kind, nodes[closed][kind]), `the ${closed} ${kind}`).not.toContain('anonymous');
      }
    }
  });

  it('002.2 a signed-in user, with the viewer role too, reads every public and every internal node', async () => {
    const signedIn: Reader[] = ['viewer', 'owner', 'shared', 'member', 'admin'];
    for (const kind of KINDS) {
      expect(await readersOf(kind, nodes.open[kind]), `a public ${kind}`).toEqual(READERS);
      expect(await readersOf(kind, nodes.internal[kind]), `an internal ${kind}`).toEqual(signedIn);
    }
  });

  it('002.3 a restricted node that inherits its namespace is read by the namespace’s members, its owner and admins, and by no one else — not by a user shared on another node of it', async () => {
    for (const kind of KINDS) {
      expect(await readersOf(kind, nodes.inheriting[kind]), `an inheriting ${kind}`).toEqual(['owner', 'member', 'admin']);
    }
  });

  it('002.4 a node set to restricted by itself is read by the users it is shared with, its owner and admins; a member of its namespace is not among them, and a share opens no other node', async () => {
    expect(await readersOf('page', nodes.own.page)).toEqual(['owner', 'shared', 'admin']);
    expect(await readersOf('document', nodes.own.document)).toEqual(['owner', 'shared', 'admin']);
    // A collection has no share list: one set to restricted by itself is shared with no one.
    expect(await readersOf('collection', nodes.own.collection)).toEqual(['owner', 'admin']);
    for (const kind of KINDS) {
      expect(await readersOf(kind, nodes.other[kind]), `another restricted ${kind} of the namespace`).toEqual(['owner', 'admin']);
    }
  });
});
