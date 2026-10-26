// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { beforeAll, describe, expect, inject, it } from 'vitest';
import { graphql } from 'graphql';
import { schema } from '$lib/features/query/server';
import { connectAs, textOf, userOf, type Role } from '$tests/integration/mcp';
import { setNodeTags } from './tags.server';

// The restricted page is shared with editorB only.

const seed = inject('seed');
type Catalog = { tag: string; count: number }[];

beforeAll(async () => {
  await setNodeTags(seed.restrictedId, ['only-restricted', 'shared-tag']);
  await setNodeTags(seed.publicId, ['shared-tag']);
});

const channels: Record<string, (role: Role) => Promise<Catalog>> = {
  'GraphQL tags': async (role) => {
    const res = await graphql({ schema, source: '{ tags { tag count } }', contextValue: { user: await userOf(role) } });
    expect(res.errors).toBeUndefined();
    return (res.data as { tags: Catalog }).tags;
  },
  'the list_tags tool': async (role) => JSON.parse(textOf(await (await connectAs(role)).callTool({ name: 'list_tags', arguments: {} }))),
  'the schema tool’s catalog': async (role) => {
    const text = textOf(await (await connectAs(role)).callTool({ name: 'schema', arguments: {} }));
    const after = text.slice(text.indexOf('# Tag catalog'));
    return JSON.parse(after.slice(after.indexOf('\n') + 1));
  },
};

const countOf = (catalog: Catalog, tag: string) => catalog.find((t) => t.tag === tag)?.count;

describe.each(Object.entries(channels))('%s', (_, catalogOf) => {
  it.each(['viewer', 'editorC'] as const)('names no tag only hidden content carries, nor counts it, for %s', async (role) => {
    const catalog = await catalogOf(role);
    expect(countOf(catalog, 'only-restricted')).toBeUndefined();
    expect(countOf(catalog, 'shared-tag')).toBe(1);
  });

  it.each(['editorB', 'admin'] as const)('names and counts the restricted page’s tags for %s, who may read it', async (role) => {
    const catalog = await catalogOf(role);
    expect(countOf(catalog, 'only-restricted')).toBe(1);
    expect(countOf(catalog, 'shared-tag')).toBe(2);
  });
});
