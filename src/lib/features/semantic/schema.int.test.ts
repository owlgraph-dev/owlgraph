// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, inject, it } from 'vitest';
import { db } from '$lib/platform/db.server';
import { createPage } from '$lib/features/pages/server';
import {
  deleteNodeClass,
  deletePropertyDefinition,
  deletePropertyGroup,
  deleteRelationshipType,
  getManualProperties,
  getNodeClassFields,
  listNodeClasses,
  setManualProperties,
  setNodeClass,
  upsertNodeClass,
  upsertPropertyDefinition,
  upsertPropertyGroup,
  upsertRelationshipType,
} from './server';
import { inheritedGroups, subtreeOf } from './nodeClassTree';
import { classPropertySlots } from './propertyGroups';
import { userOf } from '$tests/integration/users';

// Each settings form action calls the function used here and answers its
// refusal as a failure carrying the message.

const seed = inject('seed');
const CORE = ['node', 'page', 'document', 'collection'];

/** The catalogue row of a class by key, as the classes page loads it. */
const rowOf = async (slug: string) => (await listNodeClasses()).find((c) => c.slug === slug);
const typeId = async (slug: 'page' | 'document') => (await rowOf(slug))!.id;

let n = 0;
/** A domain class of the test's own under `parentId`. */
const domainClass = async (base: string, parentId: string, propertyGroup?: string) => {
  const slug = `int-${base}-${++n}`;
  const label = `Int ${base} ${n}`;
  return { ...(await upsertNodeClass({ slug, label: { en: label }, parentId, propertyGroup })), label };
};
/** A restricted page of the admin's, carrying the core properties a core-group class prefills. */
const STATUS = 'int-classified';
const corePage = async () => {
  const page = await createPage(`Classified ${++n}`, await userOf('admin'), { visibility: 'restricted' });
  await setManualProperties(page.id, [
    { name: 'core:status', value: STATUS },
    { name: 'core:priority', value: '2' },
  ]);
  return page;
};

describe('the class catalog', () => {
  it('lists the core classes, deletes none of them, and refuses a domain class under a core key as reserved', async () => {
    const catalog = await listNodeClasses();
    for (const slug of CORE) {
      const row = catalog.find((c) => c.slug === slug);
      expect(row?.kind, slug).toBe(slug === 'node' ? 'root' : 'type');
      await expect(deleteNodeClass(row!.id), slug).rejects.toMatchObject({ code: 'class_protected' });
    }
    expect((await listNodeClasses()).filter((c) => CORE.includes(c.slug)).map((c) => c.slug).sort()).toEqual([...CORE].sort());

    const refused = upsertNodeClass({ slug: 'page', label: { en: 'Not allowed' }, parentId: await typeId('page') });
    await expect(refused).rejects.toMatchObject({ code: 'reserved_key', message: expect.stringContaining('reserved') });
  });

  it('refuses to delete a class while a node carries it, counting the node meanwhile, and deletes it once the node is reset to its type', async () => {
    const cls = await domainClass('assigned', await typeId('page'));
    const page = await createPage(`Assigned ${n}`, await userOf('admin'), { visibility: 'restricted' });
    await setNodeClass(page.id, cls.id);

    await expect(deleteNodeClass(cls.id)).rejects.toMatchObject({ code: 'class_in_use', message: 'Cannot delete a class that is still assigned to nodes.' });
    expect((await rowOf(cls.slug))?.node_count).toBe(1);

    expect((await setNodeClass(page.id, null)).slug).toBe('page');
    expect((await rowOf(cls.slug))?.node_count).toBe(0);
    await deleteNodeClass(cls.id);
    expect(await rowOf(cls.slug)).toBeUndefined();
  });

  it('refuses to delete a class that still has subclasses, listing the child directly under its parent one level deeper, and deletes it once they are gone', async () => {
    const parent = await domainClass('parent', await typeId('page'));
    const child = await domainClass('child', parent.id);

    await expect(deleteNodeClass(parent.id)).rejects.toMatchObject({ code: 'class_has_children', message: expect.stringContaining('subclasses') });
    const catalog = await listNodeClasses();
    const at = catalog.findIndex((c) => c.id === parent.id);
    expect(catalog[at + 1]).toMatchObject({ id: child.id, parent_slug: parent.slug, depth: catalog[at].depth + 1 });

    await deleteNodeClass(child.id);
    await deleteNodeClass(parent.id);
    expect(await rowOf(parent.slug)).toBeUndefined();
  });
});

describe('moving a class', () => {
  it('is refused under itself or one of its subclasses, and under another node type while a node carries it or a subclass — and leaves it where it was', async () => {
    const parent = await domainClass('mover', await typeId('page'));
    const child = await domainClass('moved-child', parent.id);
    const move = (parentId: string) => upsertNodeClass({ id: parent.id, slug: parent.slug, label: { en: parent.label }, parentId });

    for (const into of [parent.id, child.id]) {
      await expect(move(into)).rejects.toMatchObject({ code: 'class_cycle', message: 'A class cannot be moved under itself or one of its subclasses.' });
    }

    const page = await createPage(`Carries the child ${n}`, await userOf('admin'), { visibility: 'restricted' });
    await setNodeClass(page.id, child.id);
    await expect(move(await typeId('document'))).rejects.toMatchObject({
      code: 'class_reparent_blocked',
      message: 'Cannot move this class under a different node type while nodes still carry it or one of its subclasses.',
    });
    for (const [cls, under] of [
      [parent, 'page'],
      [child, parent.slug],
    ] as const) {
      expect(await rowOf(cls.slug), cls.slug).toMatchObject({ parent_slug: under, node_type: 'page' });
    }

    // Nothing carries it any more: it moves, its subtree with it.
    await setNodeClass(page.id, null);
    await move(await typeId('document'));
    expect(await rowOf(parent.slug)).toMatchObject({ parent_slug: 'document', node_type: 'document' });
    expect(await rowOf(child.slug)).toMatchObject({ parent_slug: parent.slug, node_type: 'document' });
  });
});

describe('fields on a classified node', () => {
  it("gives a subclass's page its own group's fields and its ancestors', named after the ancestor; the catalog counts one inherited group, and the parent picker leaves out the class and its descendants", async () => {
    const parent = await domainClass('fields-parent', await typeId('page'), 'core');
    const child = await domainClass('fields-child', parent.id, 'edge');
    const page = await corePage();
    await setNodeClass(page.id, child.id);

    // What the page properties dialog renders.
    const fields = (await getNodeClassFields(child.id))!;
    expect(fields.nodeClass).toMatchObject({ id: child.id, label: child.label });
    expect(fields.groups.map((g) => [g.slug, g.fromClass.id, g.fromClass.label])).toEqual([
      ['edge', child.id, child.label],
      ['core', parent.id, parent.label],
    ]);
    const { slots } = classPropertySlots(fields.definitions, await getManualProperties(page.id));
    const value = (name: string) => slots.find((s) => s.name === name)?.value;
    expect(value('edge:year')).toBe('');
    expect(value('core:status')).toBe(STATUS);
    expect(value('core:priority')).toBe('2');

    // What the catalogue counts beside the child, and what editing the parent offers as its parent.
    const catalog = await listNodeClasses();
    expect(inheritedGroups(catalog, child.parent_id)).toEqual(['core']);
    const excluded = subtreeOf(catalog, parent.id);
    expect([...excluded].sort()).toEqual([parent.id, child.id].sort());
    expect(excluded.has(await typeId('page'))).toBe(false);
  });
});

describe('the reserved parameter namespace', () => {
  it('is refused as a group, as a definition’s group and as a manual property, and none is stored', async () => {
    await expect(upsertPropertyGroup({ slug: 'parameter', label: { en: 'Parameters' } })).rejects.toThrow(/"parameter" is reserved/);
    expect(await db`select 1 from property_groups where slug = 'parameter'`).toHaveLength(0);

    await expect(upsertPropertyDefinition({ localName: 'package', groupSlug: 'parameter', label: { en: 'Package' }, datatype: 'text' })).rejects.toThrow(/"parameter" is reserved/);
    expect(await db`select 1 from property_definitions where name = 'parameter:package'`).toHaveLength(0);

    const page = await createPage(`Parameter page ${++n}`, await userOf('admin'), { visibility: 'restricted' });
    const kept = await setManualProperties(page.id, [
      { name: 'parameter:package', value: 'owlgraph' },
      { name: 'core:status', value: 'kept' },
    ]);
    expect(kept).toEqual([{ name: 'core:status', value: 'kept' }]);
    expect(await getManualProperties(page.id)).toEqual([{ name: 'core:status', value: 'kept' }]);
  });
});

describe('a catalog entry still in use', () => {
  it('keeps a relationship type an edge still uses, and the edge, until the edge is gone', async () => {
    const slug = `int-cites-${++n}`;
    await upsertRelationshipType({ slug, label: { en: 'Cites' } });
    const [edge] = await db<{ id: string }[]>`
      insert into edges (source_id, target_id, relationship_type) values (${seed.publicId}, ${seed.internalId}, ${slug}) returning id`;

    await expect(deleteRelationshipType(slug)).rejects.toMatchObject({ code: 'relationship_type_in_use' });
    expect(await db`select 1 from relationship_types where slug = ${slug}`).toHaveLength(1);
    expect(await db`select 1 from edges where id = ${edge.id} and relationship_type = ${slug}`).toHaveLength(1);

    await db`delete from edges where id = ${edge.id}`;
    await deleteRelationshipType(slug);
    expect(await db`select 1 from relationship_types where slug = ${slug}`).toHaveLength(0);
  });

  it('keeps a group that still holds a definition, and the definition, until the definition is gone', async () => {
    const namespace = `int-holds-${++n}`;
    await upsertPropertyGroup({ slug: namespace, label: { en: 'Holds' } });
    await upsertPropertyDefinition({ localName: 'thing', groupSlug: namespace, label: { en: 'Thing' }, datatype: 'text' });

    await expect(deletePropertyGroup(namespace)).rejects.toMatchObject({ code: 'group_not_empty' });
    expect(await db`select 1 from property_groups where slug = ${namespace}`).toHaveLength(1);
    expect(await db`select 1 from property_definitions where name = ${`${namespace}:thing`}`).toHaveLength(1);

    await deletePropertyDefinition(`${namespace}:thing`);
    await deletePropertyGroup(namespace);
    expect(await db`select 1 from property_groups where slug = ${namespace}`).toHaveLength(0);
  });
});
