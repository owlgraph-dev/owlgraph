// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { beforeAll, describe, expect, inject, it } from 'vitest';
import { graphql } from 'graphql';
import { schema } from '$lib/features/query/server';
import { connectAs, jsonOf, textOf, userOf, type Role } from '$tests/integration/mcp';
import { getManualProperties, listPropertySuggestionOptions, setManualProperties, upsertPropertyDefinition } from './properties.server';

// The restricted page is shared with editorB only.

const seed = inject('seed');
type Names = { name: string; count: number }[];

beforeAll(async () => {
  await upsertPropertyDefinition({ localName: 'clearance', groupSlug: 'core' });
  await setManualProperties(seed.restrictedId, [
    ...(await getManualProperties(seed.restrictedId)),
    { name: 'hr:salary_band', value: 'B2' },
    { name: 'hr:team', value: 'payroll' },
    { name: 'core:clearance', value: 'high' },
  ]);
  await setManualProperties(seed.publicId, [...(await getManualProperties(seed.publicId)), { name: 'hr:team', value: 'web' }]);
});

const countOf = (names: Names, name: string) => names.find((n) => n.name === name)?.count;
const namesInUse = async (role: Role): Promise<Names> =>
  jsonOf<Names>(await (await connectAs(role)).callTool({ name: 'list_property_names', arguments: {} }));

describe('the list_property_names tool', () => {
  it.each(['viewer', 'editorC'] as const)('names no property only hidden content carries, nor counts it, for %s', async (role) => {
    const names = await namesInUse(role);
    expect(countOf(names, 'hr:salary_band')).toBeUndefined();
    expect(countOf(names, 'core:clearance')).toBeUndefined();
    expect(countOf(names, 'hr:team')).toBe(1);
  });

  it.each(['editorB', 'admin'] as const)('names and counts the restricted page’s properties for %s, who may read it', async (role) => {
    const names = await namesInUse(role);
    expect(countOf(names, 'hr:salary_band')).toBe(1);
    expect(countOf(names, 'core:clearance')).toBe(1);
    expect(countOf(names, 'hr:team')).toBe(2);
  });
});

// A viewer is refused each catalogue whole (src/mcp/graph.int.test.ts).
const suggestions: Record<string, (role: Role) => Promise<string[]>> = {
  'GraphQL propertyDefinitions': async (role) => {
    const res = await graphql({ schema, source: '{ propertyDefinitions { name } }', contextValue: { user: await userOf(role) } });
    expect(res.errors).toBeUndefined();
    return (res.data as { propertyDefinitions: { name: string }[] }).propertyDefinitions.map((d) => d.name);
  },
  'the schema tool’s catalog': async (role) => {
    const text = textOf(await (await connectAs(role)).callTool({ name: 'schema', arguments: {} }));
    const after = text.slice(text.indexOf('# Property catalog'));
    const json = after.slice(after.indexOf('\n') + 1, after.indexOf('\n\n# '));
    return (JSON.parse(json) as { name: string }[]).map((p) => p.name);
  },
  'the editor’s and the query builder’s suggestions': async (role) => (await listPropertySuggestionOptions(await userOf(role))).map((s) => s.name),
};

describe.each(Object.entries(suggestions))('%s', (_, namesOf) => {
  it('offers no ad hoc name only hidden content carries to editorC, but every registered one', async () => {
    const names = await namesOf('editorC');
    expect(names).not.toContain('hr:salary_band');
    expect(names).toEqual(expect.arrayContaining(['hr:team', 'core:clearance', seed.propStatus]));
  });

  it.each(['editorB', 'admin'] as const)('offers the restricted page’s ad hoc name to %s, who may read it', async (role) => {
    expect(await namesOf(role)).toEqual(expect.arrayContaining(['hr:salary_band', 'hr:team', 'core:clearance']));
  });
});
