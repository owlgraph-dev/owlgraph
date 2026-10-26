// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, inject, it } from 'vitest';
import { connectAs, jsonOf, textOf, type Role } from '$tests/integration/mcp';

// The seed: Graph Test Page --[mentions]--> Public Page (edge year 2020), and
// Relationship Cross Page --[refers-to]--> the restricted page.

const seed = inject('seed');

type Edge = { direction: string; node: { title: string }; properties: { name: string; value: string }[] };

describe('get_relationships', () => {
  it('lists the typed edge as outgoing from its source, with its edge property, and as incoming at its target', async () => {
    const admin = await connectAs('admin');
    const outgoing = jsonOf<Edge[]>(
      await admin.callTool({ name: 'get_relationships', arguments: { nodeId: seed.graphPageId, type: seed.relationshipTypeSlug, direction: 'outgoing' } })
    );
    expect(outgoing).toHaveLength(1);
    expect(outgoing[0].direction).toBe('outgoing');
    expect(outgoing[0].node.title).toBe(seed.publicTitle);
    expect(outgoing[0].properties).toEqual(expect.arrayContaining([expect.objectContaining({ name: seed.edgePropYear, value: '2020' })]));

    const incoming = jsonOf<Edge[]>(
      await admin.callTool({ name: 'get_relationships', arguments: { nodeId: seed.publicId, type: seed.relationshipTypeSlug, direction: 'incoming' } })
    );
    expect(incoming).toHaveLength(1);
    expect(incoming[0].direction).toBe('incoming');
    expect(incoming[0].node.title).toBe('Graph Test Page');
  });

  it('answers an unknown relationship type with a tool error, not an empty list', async () => {
    const admin = await connectAs('admin');
    const res = await admin.callTool({ name: 'get_relationships', arguments: { nodeId: seed.graphPageId, type: 'no-such-type' } });
    expect(res.isError).toBeTruthy();
    expect(textOf(res)).toMatch(/unknown relationship type/i);
  });

  it('leaves a typed edge to the restricted page out for a viewer and lists it for the editor it is shared with', async () => {
    const outgoingFor = async (role: Role) =>
      jsonOf<Edge[]>(await (await connectAs(role)).callTool({ name: 'get_relationships', arguments: { nodeId: seed.relCrossPageId, direction: 'outgoing' } }));
    expect(await outgoingFor('viewer')).toEqual([]);
    const shared = await outgoingFor('editorB');
    expect(shared).toHaveLength(1);
    expect(shared[0].node.title).toBe(seed.restrictedTitle);
  });
});

describe('traverse', () => {
  it('walks one step along a typed edge to the page at its other end, with its class', async () => {
    const admin = await connectAs('admin');
    const res = await admin.callTool({
      name: 'traverse',
      arguments: { query: { start: { nodeIds: [seed.graphPageId] }, steps: [{ edge: { type: seed.relationshipTypeSlug, direction: 'outgoing' }, repeat: 1 }] } },
    });
    expect(res.isError).toBeFalsy();
    const nodes = jsonOf<{ title: string }[]>(res);
    expect(nodes.map((n) => n.title)).toEqual([seed.publicTitle]);
    // The hydrated hit carries its class: a plain page's is the page type.
    expect(nodes[0]).toMatchObject({ classId: expect.any(String), className: 'Page' });
  });

  it('answers a filter that sets more than one of property, edge, and, or with a tool error', async () => {
    const admin = await connectAs('admin');
    const res = await admin.callTool({
      name: 'traverse',
      arguments: {
        query: {
          start: {
            filter: {
              property: { name: seed.propStatus, operator: 'eq', value: 'active' },
              edge: { type: seed.relationshipTypeSlug, direction: 'outgoing' },
            },
          },
          steps: [{ edge: { type: seed.relationshipTypeSlug, direction: 'outgoing' }, repeat: 1 }],
        },
      },
    });
    expect(res.isError).toBeTruthy();
    expect(textOf(res)).toMatch(/exactly one of/i);
  });

  it('finds nothing, without an error, for a viewer whose readable start node’s typed edge leads to a restricted page', async () => {
    const viewer = await connectAs('viewer');
    const res = await viewer.callTool({
      name: 'traverse',
      arguments: { query: { start: { nodeIds: [seed.relCrossPageId] }, steps: [{ edge: { type: seed.crossRelationshipTypeSlug, direction: 'outgoing' }, repeat: 1 }] } },
    });
    expect(res.isError).toBeFalsy();
    expect(jsonOf(res)).toEqual([]);
  });
});

describe('get_edges', () => {
  const linkedIds = async (role: Role) => {
    const res = await (await connectAs(role)).callTool({ name: 'get_edges', arguments: { pageId: seed.relCrossPageId } });
    expect(res.isError, role).toBeFalsy();
    return jsonOf<{ id: string }[]>(res).map((l) => l.id);
  };

  it('leaves out the restricted page a readable page links to, for a viewer', async () => {
    expect(await linkedIds('viewer')).not.toContain(seed.restrictedId);
  });

  it('lists that restricted page to the editor it is shared with and to an admin', async () => {
    expect(await linkedIds('editorB')).toContain(seed.restrictedId);
    expect(await linkedIds('admin')).toContain(seed.restrictedId);
  });
});

describe('the graphql tool', () => {
  it('runs a read query against the real schema and answers its data without errors', async () => {
    const admin = await connectAs('admin');
    const res = await admin.callTool({ name: 'graphql', arguments: { query: `query { search(text: "Public") { id title } }` } });
    expect(res.isError).toBeFalsy();
    const body = jsonOf<{ errors?: unknown; data: { search: { title: string }[] } }>(res);
    expect(body.errors).toBeFalsy();
    expect(body.data.search.map((s) => s.title)).toContain(seed.publicTitle);
  });

  it('refuses a mutation before running it', async () => {
    const admin = await connectAs('admin');
    const res = await admin.callTool({ name: 'graphql', arguments: { query: 'mutation { foo }' } });
    expect(res.isError).toBeTruthy();
    expect(textOf(res)).toMatch(/only query operations/i);
  });

  it('answers a field a viewer may not read as a forbidden entry in the result’s errors, not as a tool error', async () => {
    const viewer = await connectAs('viewer');
    const res = await viewer.callTool({ name: 'graphql', arguments: { query: `query { propertyDefinitions { name } }` } });
    expect(res.isError).toBeFalsy();
    expect(jsonOf<{ errors: string[] }>(res).errors).toEqual(expect.arrayContaining([expect.stringMatching(/forbidden/i)]));
  });
});

describe('the schema tool', () => {
  it('answers the SDL to every role, and the property and relationship type catalogs only to an editor or admin, saying so to a viewer', async () => {
    const adminText = textOf(await (await connectAs('admin')).callTool({ name: 'schema', arguments: {} }));
    expect(adminText).toContain('type Query');
    expect(adminText).toContain('Property catalog');
    expect(adminText).toContain('Relationship type catalog');
    expect(adminText).not.toContain('requires editor/admin role');

    const viewerText = textOf(await (await connectAs('viewer')).callTool({ name: 'schema', arguments: {} }));
    expect(viewerText).toContain('type Query');
    expect(viewerText).toMatch(/Property catalog: omitted \(requires editor\/admin role\)/);
    expect(viewerText).toMatch(/Relationship type catalog: omitted \(requires editor\/admin role\)/);
  });
});
