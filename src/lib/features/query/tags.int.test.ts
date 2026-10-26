// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { beforeAll, describe, expect, inject, it } from 'vitest';
import { graphql } from 'graphql';
import { setNodeTags } from '$lib/features/semantic/server';
import { schema } from './server';
import { userOf, type Role } from '$tests/integration/users';

const seed = inject('seed');

beforeAll(async () => {
  await setNodeTags(seed.publicId, ['Alpha', 'shared']);
  await setNodeTags(seed.internalId, ['beta', 'Shared']);
  await setNodeTags(seed.restrictedId, ['alpha']);
});

async function graph<T>(role: Role, source: string, variableValues?: Record<string, unknown>): Promise<T> {
  const res = await graphql({ schema, source, variableValues, contextValue: { user: await userOf(role) } });
  expect(res.errors).toBeUndefined();
  return res.data as T;
}
const titlesAs = async (role: Role, filter: unknown) =>
  (await graph<{ nodes: { title: string }[] }>(role, 'query($filter: NodeFilter!) { nodes(filter: $filter) { title } }', { filter })).nodes.map((n) => n.title).sort();
const tag = (operator: string, value: string | string[]) => ({ tag: Array.isArray(value) ? { operator, values: value } : { operator, value } });

describe('querying by tag', () => {
  it('HAS matches case-insensitively and never answers a tagged page the viewer cannot read', async () => {
    // "alpha" is on the public page (as "Alpha") and on the restricted one.
    expect(await titlesAs('viewer', tag('HAS', 'alpha'))).toEqual([seed.publicTitle]);
    expect(await titlesAs('viewer', tag('HAS', 'ALPHA'))).toEqual([seed.publicTitle]);
    expect(await titlesAs('viewer', tag('HAS', 'nonexistent-tag'))).toEqual([]);
    expect(await titlesAs('editorB', tag('HAS', 'alpha'))).toEqual([seed.publicTitle, seed.restrictedTitle].sort());
  });

  it('HAS_ANY, HAS_ALL and HAS_NONE are set predicates in which duplicates and case variants count once, all under the viewer’s visibility', async () => {
    expect(await titlesAs('viewer', tag('HAS_ANY', ['beta', 'nonexistent']))).toEqual([seed.internalTitle]);
    expect(await titlesAs('viewer', tag('HAS_ANY', ['SHARED']))).toEqual([seed.internalTitle, seed.publicTitle].sort());
    expect(await titlesAs('viewer', tag('HAS_ALL', ['alpha', 'shared']))).toEqual([seed.publicTitle]);
    expect(await titlesAs('viewer', tag('HAS_ALL', ['ALPHA', 'alpha', 'Shared']))).toEqual([seed.publicTitle]);
    expect(await titlesAs('viewer', tag('HAS_ALL', ['alpha', 'beta']))).toEqual([]);

    const none = await titlesAs('viewer', tag('HAS_NONE', ['shared']));
    expect(none).not.toContain(seed.publicTitle);
    expect(none).not.toContain(seed.internalTitle);
    expect(none).not.toContain(seed.restrictedTitle); // visibility still applies
  });

  it('a tag condition and a property condition under AND answer only the pages meeting both', async () => {
    const both = { and: [tag('HAS_ANY', ['shared']), { property: { name: seed.propStatus, operator: 'EQ', value: 'active' } }] };
    expect(await titlesAs('viewer', both)).toEqual([seed.internalTitle, seed.publicTitle].sort());
  });

  it('the tags catalog lists every tag in use, each spelling with its node count', async () => {
    const { tags } = await graph<{ tags: { tag: string; count: number }[] }>('admin', 'query { tags { tag count } }');
    expect(tags.find((r) => r.tag === 'Alpha')).toEqual({ tag: 'Alpha', count: 1 });
    expect(tags.find((r) => r.tag === 'alpha')).toEqual({ tag: 'alpha', count: 1 });
    expect(tags.find((r) => r.tag === 'shared')).toEqual({ tag: 'shared', count: 1 });
    expect(tags.find((r) => r.tag === 'Shared')).toEqual({ tag: 'Shared', count: 1 });
  });
});
