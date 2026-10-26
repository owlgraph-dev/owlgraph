// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import { activeFilterCount, applyGraphFilter, EMPTY_FILTER, expandClassIds, isFilterEmpty, relationshipTypeItems, type GraphFilter } from './graphFilter';
import type { GraphNode, GraphEdge } from './types';
import type { NodeClassOption } from '$lib/features/semantic';

const cls = (id: string, parentId: string | null, depth: number): NodeClassOption => ({
  id, slug: id, label: id, description: '', kind: depth === 1 ? 'type' : 'domain', parentId, nodeType: 'page', depth,
});
// page → article → news; document
const classes = [cls('page', null, 1), cls('article', 'page', 2), cls('news', 'article', 3), cls('document', null, 1)];

const node = (id: string, over: Partial<GraphNode> = {}): GraphNode => ({ id, title: id, type: 'page', classId: 'page', namespaceId: 'ns1', ...over });
const edge = (source: string, target: string, relationshipType?: string): GraphEdge => ({
  source, target, edgeId: `${source}-${target}`,
  ...(relationshipType ? { relationshipType, relationshipLabel: relationshipType.toUpperCase() } : {}),
});

const nodes = [
  node('a'),
  node('b', { classId: 'article' }),
  node('c', { classId: 'news', namespaceId: 'ns2' }),
  node('d', { type: 'document', classId: 'document' }),
  node('lonely'),
];
const edges = [edge('a', 'b'), edge('b', 'c', 'mentions'), edge('a', 'd', 'attaches')];

const filter = (over: Partial<GraphFilter>): GraphFilter => ({ ...EMPTY_FILTER, ...over });
const ids = (g: { nodes: GraphNode[] }) => g.nodes.map((n) => n.id);

describe('applyGraphFilter', () => {
  it('is a no-op for the empty filter', () => {
    const out = applyGraphFilter(nodes, edges, EMPTY_FILTER, classes);
    expect(ids(out)).toEqual(['a', 'b', 'c', 'd', 'lonely']);
    expect(out.edges).toHaveLength(3);
    expect(isFilterEmpty(EMPTY_FILTER)).toBe(true);
  });

  it('filters by node type and drops edges that lose an endpoint', () => {
    const out = applyGraphFilter(nodes, edges, filter({ types: new Set(['document']) }), classes);
    expect(ids(out)).toEqual(['d']);
    expect(out.edges).toEqual([]);
  });

  it('treats a class filter as is-a: the class and every subclass', () => {
    const out = applyGraphFilter(nodes, edges, filter({ classIds: new Set(['article']) }), classes);
    expect(ids(out)).toEqual(['b', 'c']);
    expect(out.edges.map((e) => e.edgeId)).toEqual(['b-c']);
    expect(expandClassIds(new Set(['page']), classes)).toEqual(new Set(['page', 'article', 'news']));
  });

  it('filters by namespace', () => {
    const out = applyGraphFilter(nodes, edges, filter({ namespaceIds: new Set(['ns2']) }), classes);
    expect(ids(out)).toEqual(['c']);
  });

  it('keeps only edges of the picked relationship types; untyped edges never match', () => {
    const out = applyGraphFilter(nodes, edges, filter({ relationshipTypes: new Set(['mentions']) }), classes);
    expect(ids(out)).toEqual(['a', 'b', 'c', 'd', 'lonely']);
    expect(out.edges.map((e) => e.edgeId)).toEqual(['b-c']);
  });

  it('hides unconnected nodes after the edge filter has been applied', () => {
    const out = applyGraphFilter(nodes, edges, filter({ relationshipTypes: new Set(['mentions']), hideUnconnected: true }), classes);
    expect(ids(out)).toEqual(['b', 'c']);
    const plain = applyGraphFilter(nodes, edges, filter({ hideUnconnected: true }), classes);
    expect(ids(plain)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('combines dimensions with AND', () => {
    const out = applyGraphFilter(nodes, edges, filter({ classIds: new Set(['page']), namespaceIds: new Set(['ns1']), types: new Set(['page']) }), classes);
    expect(ids(out)).toEqual(['a', 'b', 'lonely']);
  });
});

describe('relationshipTypeItems', () => {
  it('lists each present type once, labelled, sorted', () => {
    expect(relationshipTypeItems([...edges, edge('c', 'a', 'mentions')])).toEqual([
      { value: 'attaches', label: 'ATTACHES' },
      { value: 'mentions', label: 'MENTIONS' },
    ]);
  });
});

describe('activeFilterCount', () => {
  it('counts every chosen value and the hide-unconnected switch', () => {
    expect(activeFilterCount(EMPTY_FILTER)).toBe(0);
    expect(activeFilterCount({ ...EMPTY_FILTER, types: new Set(['document']) })).toBe(1);
    expect(
      activeFilterCount({ types: new Set(['page']), classIds: new Set(['a', 'b']), namespaceIds: new Set(['n']), relationshipTypes: new Set(['cites']), hideUnconnected: true })
    ).toBe(6);
  });
});
