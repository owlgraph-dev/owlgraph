// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, inject, it } from 'vitest';
import { graphql } from 'graphql';
import { db } from '$lib/platform/db.server';
import { createNamespace } from '$lib/features/namespaces/server';
import { createPage } from '$lib/features/pages/server';
import { schema } from './server';
import { userOf, type Role } from '$tests/integration/users';

// On this file's own database, so a result set is exactly the seed and what a
// test makes. The public and internal pages carry status active, the restricted
// one (editorA's, shared with editorB) secret; each has a priority; Graph Test
// Page --[mentions, year 2020]--> the public page.

const seed = inject('seed');

const NODES = `query($filter: NodeFilter!, $orderBy: OrderBy) {
  nodes(filter: $filter, orderBy: $orderBy) { title slug createdAt updatedAt namespaceId properties { name value } }
}`;

type Node = { title: string; slug: string; createdAt: string; updatedAt: string; properties: { name: string; value: string }[] };

async function nodesAs(role: Role | 'anonymous', filter: unknown, orderBy?: unknown) {
  const user = role === 'anonymous' ? null : await userOf(role);
  const res = await graphql({ schema, source: NODES, variableValues: { filter, orderBy }, contextValue: { user } });
  return { errors: res.errors, nodes: (res.data as { nodes: Node[] } | null)?.nodes ?? null };
}
const titles = (nodes: Node[] | null) => (nodes ?? []).map((n) => n.title).sort();

const statusIs = (value: string) => ({ property: { name: seed.propStatus, operator: 'EQ', value } });

describe('the filter grammar', () => {
  it('a CONTAINS condition on a number property is a rejected query naming the property, with no data', async () => {
    const { errors, nodes } = await nodesAs('viewer', { property: { name: seed.propPriority, operator: 'CONTAINS', value: '1' } });
    expect(errors).toBeTruthy();
    expect(nodes).toBeNull();
    expect(JSON.stringify(errors)).toContain(seed.propPriority);
  });

  it('an edge condition naming an unknown relationship type is a rejected query naming it, not an empty result', async () => {
    const { errors, nodes } = await nodesAs('admin', { edge: { type: 'no-such-type', direction: 'EITHER' } });
    expect(errors).toBeTruthy();
    expect(nodes).toBeNull();
    expect(JSON.stringify(errors)).toContain('no-such-type');
  });
});

describe('property and edge conditions', () => {
  it('a property EQ condition run for a viewer answers the public and the internal page with that value, not the restricted one', async () => {
    const { errors, nodes } = await nodesAs('viewer', statusIs('active'));
    expect(errors).toBeUndefined();
    expect(titles(nodes)).toEqual([seed.internalTitle, seed.publicTitle].sort());
  });

  it('a node answered carries all of its properties, not just the one the filter names', async () => {
    const { nodes } = await nodesAs('viewer', statusIs('active'));
    const pub = nodes!.find((n) => n.title === seed.publicTitle)!;
    expect(pub.properties.map((p) => p.name).sort()).toEqual([seed.propPriority, seed.propStatus].sort());
  });

  it('an edge condition on a relationship type matches the edge’s source with OUTGOING and its target with INCOMING', async () => {
    const outgoing = await nodesAs('admin', { edge: { type: seed.relationshipTypeSlug, direction: 'OUTGOING' } });
    expect(outgoing.errors).toBeUndefined();
    expect(titles(outgoing.nodes)).toEqual(['Graph Test Page']);
    const incoming = await nodesAs('admin', { edge: { type: seed.relationshipTypeSlug, direction: 'INCOMING' } });
    expect(titles(incoming.nodes)).toEqual([seed.publicTitle]);
  });

  it('an edge condition’s edge-property condition keeps only the nodes whose edge carries a matching value, and none for a value no edge has', async () => {
    const edge = (value: string) => ({ edge: { type: seed.relationshipTypeSlug, direction: 'OUTGOING', property: { name: seed.edgePropYear, operator: 'EQ', value } } });
    expect(titles((await nodesAs('admin', edge('2020'))).nodes)).toEqual(['Graph Test Page']);
    const none = await nodesAs('admin', edge('1999'));
    expect(none.errors).toBeUndefined();
    expect(none.nodes).toEqual([]);
  });
});

describe('intrinsic conditions and sorting', () => {
  const slugIs = (slug: string) => ({ intrinsic: { field: 'SLUG', operator: 'EQ', value: slug } });

  it('a slug EQ condition answers exactly the page with that slug', async () => {
    const { errors, nodes } = await nodesAs('viewer', slugIs(seed.publicSlug));
    expect(errors).toBeUndefined();
    expect(nodes).toHaveLength(1);
    expect(nodes![0]).toMatchObject({ title: seed.publicTitle, slug: seed.publicSlug });
  });

  it('a node’s createdAt and updatedAt are ISO-8601 strings, never epoch milliseconds', async () => {
    const [node] = (await nodesAs('viewer', slugIs(seed.publicSlug))).nodes!;
    const ISO_8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
    expect(node.createdAt).toMatch(ISO_8601);
    expect(node.updatedAt).toMatch(ISO_8601);
  });

  it('a namespaceId condition naming a restricted namespace the viewer is not in answers no rows and no error; its member’s query finds its page', async () => {
    const admin = await userOf('admin');
    const ns = await createNamespace({ name: 'Hidden for queries', slug: 'hidden-for-queries', accessLevel: 'restricted' });
    await createPage('In the hidden namespace', admin, { namespaceId: ns.id });
    const inNamespace = { intrinsic: { field: 'NAMESPACE_ID', operator: 'EQ', value: ns.id } };

    const viewer = await nodesAs('viewer', inNamespace);
    expect(viewer.errors).toBeUndefined();
    expect(viewer.nodes).toEqual([]);
    expect(titles((await nodesAs('admin', inNamespace)).nodes)).toEqual(['In the hidden namespace']);
  });

  it('an INTRINSIC orderBy on slug ascending answers the pages in the database’s slug order', async () => {
    const admin = await userOf('admin');
    const made = [];
    for (const title of ['Zeta sort', 'alpha-b sort', 'Alpha sort', 'beta 2 sort', 'beta 10 sort']) made.push((await createPage(title, admin)).slug);
    const { errors, nodes } = await nodesAs('admin', { intrinsic: { field: 'SLUG', operator: 'IN', values: made } }, { kind: 'INTRINSIC', name: 'slug', direction: 'ASC' });
    expect(errors).toBeUndefined();
    const expected = (await db<{ slug: string }[]>`select slug from nodes where slug in ${db(made)} order by slug`).map((r) => r.slug);
    expect(nodes!.map((n) => n.slug)).toEqual(expected);
  });
});

describe('viewer scoping', () => {
  const eitherStatus = { or: [statusIs('active'), statusIs('secret')] };

  it('under an OR of two property conditions, anonymous gets the public page, a non-shared editor the public and the internal one, the shared editor and the owner all three', async () => {
    const all = [seed.internalTitle, seed.publicTitle, seed.restrictedTitle].sort();
    expect(titles((await nodesAs('anonymous', eitherStatus)).nodes)).toEqual([seed.publicTitle]);
    expect(titles((await nodesAs('editorC', eitherStatus)).nodes)).toEqual([seed.internalTitle, seed.publicTitle].sort());
    expect(titles((await nodesAs('editorB', eitherStatus)).nodes)).toEqual(all);
    expect(titles((await nodesAs('editorA', eitherStatus)).nodes)).toEqual(all);
  });

  it('a type EQ page condition run for a viewer includes the public and the internal page and leaves out the restricted one', async () => {
    const { errors, nodes } = await nodesAs('viewer', { intrinsic: { field: 'TYPE', operator: 'EQ', value: 'page' } });
    expect(errors).toBeUndefined();
    const found = titles(nodes);
    expect(found).toContain(seed.publicTitle);
    expect(found).toContain(seed.internalTitle);
    expect(found).not.toContain(seed.restrictedTitle);
  });
});
