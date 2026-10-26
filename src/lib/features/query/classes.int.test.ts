// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { beforeAll, describe, expect, inject, it } from 'vitest';
import { graphql } from 'graphql';
import { db } from '$lib/platform/db.server';
import { createPage } from '$lib/features/pages/server';
import { setManualProperties, setNodeClass, upsertNodeClass } from '$lib/features/semantic/server';
import { schema } from './server';
import { userOf, type Role } from '$tests/integration/users';

const seed = inject('seed');

type ClassRow = { id: string; slug: string; label: string; kind: string; parentId: string | null; nodeType: string | null };
type Hit = { title: string; classId: string; className: string };

let pageTypeId = '';
let parentId = '';
let childId = '';
const classed = { title: 'Classed page', status: 'classed-status' };

beforeAll(async () => {
  pageTypeId = (await db<{ id: string }[]>`select id from node_classes where slug = 'page'`)[0].id;
  parentId = (await upsertNodeClass({ slug: 'q-parent', label: { en: 'Q Parent' }, parentId: pageTypeId })).id;
  childId = (await upsertNodeClass({ slug: 'q-child', label: { en: 'Q Child' }, parentId })).id;
  const page = await createPage(classed.title, await userOf('admin'), { visibility: 'internal' });
  await setManualProperties(page.id, [{ name: seed.propStatus, value: classed.status }]);
  await setNodeClass(page.id, childId);
});

async function nodesAs(role: Role, filter: unknown): Promise<Hit[]> {
  const res = await graphql({
    schema,
    source: 'query($filter: NodeFilter!) { nodes(filter: $filter) { title classId className } }',
    variableValues: { filter },
    contextValue: { user: await userOf(role) },
  });
  expect(res.errors).toBeUndefined();
  return (res.data as { nodes: Hit[] }).nodes;
}
const titlesAs = async (role: Role, filter: unknown) => (await nodesAs(role, filter)).map((n) => n.title).sort();
const isA = (value: string, classMatch?: 'EXACT') => ({ intrinsic: { field: 'CLASS_ID', operator: 'EQ', value, ...(classMatch ? { classMatch } : {}) } });

describe('querying by class', () => {
  it('the nodeClasses catalog lists a domain class with its id, label, DOMAIN kind, parent and node type, the page type as TYPE, and never the abstract root', async () => {
    const res = await graphql({ schema, source: 'query { nodeClasses { id slug label kind parentId nodeType } }', contextValue: { user: await userOf('admin') } });
    expect(res.errors).toBeUndefined();
    const classes = (res.data as { nodeClasses: ClassRow[] }).nodeClasses;
    expect(classes.find((c) => c.slug === 'q-child')).toMatchObject({ id: childId, label: 'Q Child', kind: 'DOMAIN', parentId, nodeType: 'page' });
    expect(classes.find((c) => c.slug === 'page')).toMatchObject({ kind: 'TYPE', nodeType: 'page' });
    expect(classes.find((c) => c.slug === 'node')).toBeUndefined();
  });

  it('EQ and IN match the class and its subclasses, EXACT only the class itself, and NEQ is the complement, all under the viewer’s visibility', async () => {
    expect(await titlesAs('viewer', isA(parentId))).toEqual([classed.title]);
    expect(await titlesAs('viewer', isA(childId))).toEqual([classed.title]);
    expect(await titlesAs('viewer', { intrinsic: { field: 'CLASS_ID', operator: 'IN', values: [parentId] } })).toEqual([classed.title]);
    expect(await titlesAs('viewer', isA(parentId, 'EXACT'))).toEqual([]);
    expect(await titlesAs('viewer', isA(childId, 'EXACT'))).toEqual([classed.title]);

    const notParent = await titlesAs('viewer', { intrinsic: { field: 'CLASS_ID', operator: 'NEQ', value: parentId } });
    expect(notParent).toContain(seed.publicTitle); // a plain page is not a parent
    expect(notParent).not.toContain(classed.title); // a child is one
    expect(notParent).not.toContain(seed.restrictedTitle); // visibility still applies
    expect(await titlesAs('viewer', { intrinsic: { field: 'CLASS_ID', operator: 'NEQ', value: parentId, classMatch: 'EXACT' } })).toContain(classed.title);
  });

  it('a class condition on the page node type matches every readable page whatever its subclass, and with EXACT only the pages without a domain class', async () => {
    const pages = await titlesAs('viewer', isA(pageTypeId));
    expect(pages).toEqual(expect.arrayContaining([seed.publicTitle, seed.internalTitle, classed.title]));
    expect(pages).not.toContain(seed.restrictedTitle);
    const plain = await titlesAs('viewer', isA(pageTypeId, 'EXACT'));
    expect(plain).toContain(seed.publicTitle);
    expect(plain).not.toContain(classed.title);
  });

  it('each result carries its class id and class name, a page without a domain class the page type’s', async () => {
    const byTitle = new Map((await nodesAs('viewer', isA(pageTypeId))).map((n) => [n.title, n]));
    expect(byTitle.get(classed.title)).toMatchObject({ classId: childId, className: 'Q Child' });
    expect(byTitle.get(seed.publicTitle)).toMatchObject({ classId: pageTypeId, className: 'Page' });
  });

  it('a class condition and a property condition under AND answer only the pages meeting both', async () => {
    expect(await titlesAs('viewer', { and: [isA(parentId), { property: { name: seed.propStatus, operator: 'EQ', value: classed.status } }] })).toEqual([classed.title]);
    expect(await titlesAs('viewer', { and: [isA(parentId), { property: { name: seed.propStatus, operator: 'EQ', value: 'active' } }] })).toEqual([]);
  });
});
