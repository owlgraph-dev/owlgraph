// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { beforeAll, describe, expect, inject, it } from 'vitest';
import { db } from '$lib/platform/db.server';
import { getUserByToken, type SessionUser } from '$lib/features/auth/server';
import { createNamespace, setNamespaceMembers } from '$lib/features/namespaces/server';
import { createPage } from '$lib/features/pages/server';
import { userCanReadNode, type NodeAccessRow } from './access.server';
import { readableNodes } from './nodes.server';

// Read access is decided twice, per node by userCanReadNode and in SQL by
// readableNodes; both must agree for every reader.

const seed = inject('seed');
type Reader = 'anonymous' | 'viewer' | 'owner' | 'shared' | 'member' | 'admin';
type Node = 'public' | 'internal' | 'restricted' | 'namespace-restricted';

// The seeded pages are editorA's; the restricted one is shared with editorB.
// The namespace page is an admin's, in a restricted namespace editorC belongs to.
const EXPECTED: Record<Node, Reader[]> = {
  public: ['anonymous', 'viewer', 'owner', 'shared', 'member', 'admin'],
  internal: ['viewer', 'owner', 'shared', 'member', 'admin'],
  restricted: ['owner', 'shared', 'admin'],
  'namespace-restricted': ['member', 'admin'],
};

const readers = {} as Record<Reader, SessionUser | null>;
const nodes = {} as Record<Node, string>;

beforeAll(async () => {
  const user = async (token: string) => (await getUserByToken(token))!;
  Object.assign(readers, {
    anonymous: null,
    viewer: await user(seed.tokens.viewer),
    owner: await user(seed.tokens.editorA),
    shared: await user(seed.tokens.editorB),
    member: await user(seed.tokens.editorC),
    admin: await user(seed.tokens.admin),
  });
  const namespace = await createNamespace({ name: 'Members only', slug: 'members-only', accessLevel: 'restricted' });
  await setNamespaceMembers(namespace.id, [readers.member!.id]);
  const inNamespace = await createPage('Members page', readers.admin, { namespaceId: namespace.id });
  Object.assign(nodes, { public: seed.publicId, internal: seed.internalId, restricted: seed.restrictedId, 'namespace-restricted': inNamespace.id });
});

async function accessRow(id: string): Promise<NodeAccessRow> {
  const [row] = await db<NodeAccessRow[]>`
    select n.id, n.visibility, n.created_by, n.namespace_id, ns.access_level as namespace_access_level
    from nodes n join namespaces ns on ns.id = n.namespace_id where n.id = ${id}`;
  return row;
}

async function readableBySql(user: SessionUser | null): Promise<Set<string>> {
  const ids = Object.values(nodes);
  const rows = await db<{ id: string }[]>`select n.id from nodes n where n.id in ${db(ids)} and ${readableNodes(user, 'n')}`;
  return new Set(rows.map((r) => r.id));
}

describe('who may read a node: the per-node check and the SQL filter agree for every reader', () => {
  for (const reader of ['anonymous', 'viewer', 'owner', 'shared', 'member', 'admin'] as const) {
    it(`${reader}`, async () => {
      const bySql = await readableBySql(readers[reader]);
      for (const node of Object.keys(EXPECTED) as Node[]) {
        const expected = EXPECTED[node].includes(reader);
        const byNode = await userCanReadNode(readers[reader], await accessRow(nodes[node]), 'page');
        expect(byNode, `${reader} reading ${node} (per node)`).toBe(expected);
        expect(bySql.has(nodes[node]), `${reader} reading ${node} (SQL)`).toBe(expected);
      }
    });
  }
});
