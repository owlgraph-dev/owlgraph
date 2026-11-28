// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { beforeAll, describe, expect, it } from 'vitest';
import type { SessionUser } from '#lib/features/auth/server.ts';
import { createCollection } from '#lib/features/collections/server.ts';
import { createLinkDocument } from '#lib/features/documents/server.ts';
import { createPage } from '#lib/features/pages/server.ts';
import {
  deleteNodeClass,
  getManualProperties,
  getNodeClassRefs,
  listNodeClasses,
  setManualProperties,
  setNodeClasses,
  upsertNodeClass,
} from '#lib/features/semantic/server.ts';
import { db } from '#lib/platform/db.server.ts';
import { userOf } from '#tests/integration/users.ts';

// A node's classes and the class hierarchy (docs/features/006-semantic-layer.md,
// "Acceptance criteria"), on classes and nodes of each test's own.

type Kind = 'page' | 'document' | 'collection';
const KINDS: Kind[] = ['page', 'document', 'collection'];

let admin: SessionUser;
beforeAll(async () => {
  admin = await userOf('admin');
});

let made = 0;
async function make(kind: Kind): Promise<string> {
  const title = `A ${kind} ${++made}`;
  if (kind === 'page') return (await createPage(title, admin)).id;
  if (kind === 'document') return (await createLinkDocument({ url: 'https://example.org/file', title, createdBy: admin.id, user: admin })).id;
  return (await createCollection({ title, createdBy: admin.id, user: admin })).id;
}

const typeId = async (kind: Kind) => (await listNodeClasses()).find((c) => c.kind === 'type' && c.slug === kind)!.id;
/** A class of the test's own under `parentId`. */
const aClass = async (name: string, parentId: string) => upsertNodeClass({ slug: `${name}-${++made}`, label: { en: `${name} ${made}` }, parentId });
const classesOf = async (id: string) => (await getNodeClassRefs(id)).map((c) => c.id).sort();
/** Everything a class may not take with it: the node's values and every relationship that touches it. */
const heldBy = async (id: string) => ({
  values: await getManualProperties(id),
  relationships: (await db<{ source_id: string; target_id: string }[]>`select source_id, target_id from edges where source_id = ${id} or target_id = ${id} order by source_id`).length,
});

describe('a node’s classes', () => {
  it('006.6 a node has any number of classes, or none of its own; giving one and taking one away deletes no property value and no relationship', async () => {
    for (const kind of KINDS) {
      const type = await typeId(kind);
      const [first, second] = [await aClass(`first-${kind}`, type), await aClass(`second-${kind}`, type)];
      const node = await make(kind);
      await setManualProperties(node, [{ name: 'core:status', value: 'kept' }]);
      const other = await make('page');
      await db`insert into edges (source_id, target_id) values (${other}, ${node})`;
      const before = await heldBy(node);
      expect(before, `what the ${kind} holds`).toEqual({ values: [expect.objectContaining({ name: 'core:status', value: 'kept' })], relationships: 1 });

      // None of its own: it has its type's class, as before any class was given.
      expect(await classesOf(node), `a new ${kind}`).toEqual([type]);
      await setNodeClasses(node, [first.id, second.id]);
      expect(await classesOf(node), `the ${kind} given two classes`).toEqual([first.id, second.id].sort());
      expect(await heldBy(node), `the ${kind} given two classes`).toEqual(before);
      await setNodeClasses(node, [second.id]);
      expect(await classesOf(node), `the ${kind}, one class taken away`).toEqual([second.id]);
      expect(await heldBy(node), `the ${kind}, one class taken away`).toEqual(before);
      await setNodeClasses(node, []);
      expect(await classesOf(node), `the ${kind}, every class taken away`).toEqual([type]);
      expect(await heldBy(node), `the ${kind}, every class taken away`).toEqual(before);
    }
  });
});

describe('the class hierarchy', () => {
  it('006.8 a class has at most one parent and is never its own ancestor; a class a node has, or one another class sits below, cannot be deleted', async () => {
    const type = await typeId('page');
    const parent = await aClass('parent', type);
    const child = await aClass('child', parent.id);
    const elsewhere = await aClass('elsewhere', type);
    const move = (cls: { id: string; slug: string }, parentId: string) => upsertNodeClass({ id: cls.id, slug: cls.slug, parentId });
    const parentOf = async (id: string) => (await listNodeClasses()).find((c) => c.id === id)!.parent_id;

    // One parent: a move puts the class under the new one, and under nothing else.
    await move(child, elsewhere.id);
    expect(await parentOf(child.id)).toBe(elsewhere.id);
    await move(child, parent.id);
    expect(await parentOf(child.id)).toBe(parent.id);
    // Never its own ancestor.
    for (const under of [parent, child]) {
      await expect(move(parent, under.id), `the parent moved under ${under.slug}`).rejects.toMatchObject({ code: 'class_cycle' });
    }
    expect(await parentOf(parent.id)).toBe(type);

    // A class a node has, among its others, stays; so does one with a class below it.
    const node = await make('page');
    await setNodeClasses(node, [child.id, elsewhere.id]);
    await expect(deleteNodeClass(child.id)).rejects.toMatchObject({ code: 'class_in_use' });
    await expect(deleteNodeClass(parent.id)).rejects.toMatchObject({ code: 'class_has_children' });
    await setNodeClasses(node, [elsewhere.id]);
    await deleteNodeClass(child.id);
    await deleteNodeClass(parent.id);
    expect((await listNodeClasses()).map((c) => c.id)).not.toContain(child.id);
    expect(await classesOf(node)).toEqual([elsewhere.id]);
  });
});
