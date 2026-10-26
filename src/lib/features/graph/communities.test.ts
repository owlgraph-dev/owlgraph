// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import { detectCommunities } from './communities';
import type { GraphNode, GraphEdge } from './types';

const node = (id: string): GraphNode => ({ id, title: id });
const edge = (source: string, target: string): GraphEdge => ({ source, target, edgeId: `${source}-${target}` });
const nodesOf = (...ids: string[]) => ids.map(node);
const sorted = (groups: string[][]) => groups.map((g) => [...g].sort()).sort((a, b) => a[0].localeCompare(b[0]));

const clique = (ids: string[]): GraphEdge[] => {
  const out: GraphEdge[] = [];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) out.push(edge(ids[i], ids[j]));
  return out;
};

describe('detectCommunities', () => {
  it('splits two triangles joined by one edge into two communities', () => {
    const nodes = nodesOf('a', 'b', 'c', 'd', 'e', 'f');
    const edges = [...clique(['a', 'b', 'c']), ...clique(['d', 'e', 'f']), edge('c', 'd')];
    const { groups, groupOf } = detectCommunities(nodes, edges);
    expect(sorted(groups)).toEqual([['a', 'b', 'c'], ['d', 'e', 'f']]);
    expect(groupOf.get('a')).toBe(groupOf.get('c'));
    expect(groupOf.get('a')).not.toBe(groupOf.get('d'));
  });

  it('splits two K5 joined by one edge', () => {
    const left = ['a', 'b', 'c', 'd', 'e'];
    const right = ['f', 'g', 'h', 'i', 'j'];
    const { groups } = detectCommunities(nodesOf(...left, ...right), [...clique(left), ...clique(right), edge('e', 'f')]);
    expect(sorted(groups)).toEqual([left, right]);
  });

  it('keeps a star in one community', () => {
    const nodes = nodesOf('hub', 'l1', 'l2', 'l3', 'l4');
    const edges = ['l1', 'l2', 'l3', 'l4'].map((l) => edge('hub', l));
    expect(detectCommunities(nodes, edges).groups).toHaveLength(1);
  });

  it('pairs up a path of four and never leaves a connected node alone', () => {
    const { groups, groupOf } = detectCommunities(nodesOf('a', 'b', 'c', 'd'), [edge('a', 'b'), edge('b', 'c'), edge('c', 'd')]);
    expect(sorted(groups)).toEqual([['a', 'b'], ['c', 'd']]);
    for (const [s, t] of [['a', 'b'], ['c', 'd']]) expect(groupOf.get(s)).toBe(groupOf.get(t));
  });

  it('returns every node as its own community, in input order, when there are no edges', () => {
    const { groups } = detectCommunities(nodesOf('z', 'y', 'x'), []);
    expect(groups).toEqual([['z'], ['y'], ['x']]);
  });

  it('ignores self-loops, dangling references, and counts parallel/reciprocal edges once', () => {
    const nodes = nodesOf('a', 'b', 'c', 'd', 'e', 'f');
    const base = [...clique(['a', 'b', 'c']), ...clique(['d', 'e', 'f']), edge('c', 'd')];
    const noisy = [...base, edge('a', 'a'), edge('a', 'ghost'), edge('b', 'a'), edge('d', 'c'), edge('c', 'd')];
    expect(sorted(detectCommunities(nodes, noisy).groups)).toEqual(sorted(detectCommunities(nodes, base).groups));
  });

  it('covers every node exactly once, members in input order, groups by first appearance', () => {
    const nodes = nodesOf('d', 'a', 'solo', 'e', 'b', 'f', 'c');
    const edges = [...clique(['a', 'b', 'c']), ...clique(['d', 'e', 'f'])];
    const { groups, groupOf } = detectCommunities(nodes, edges);
    expect(groups.flat().sort()).toEqual(nodes.map((n) => n.id).sort());
    expect(groups[0][0]).toBe('d');
    expect(groups.find((g) => g.includes('a'))).toEqual(['a', 'b', 'c']);
    for (const [k, g] of groups.entries()) for (const id of g) expect(groupOf.get(id)).toBe(k);
  });

  it('is deterministic, including under reversed edge order', () => {
    const nodes = nodesOf('a', 'b', 'c', 'd', 'e', 'f', 'g');
    const edges = [...clique(['a', 'b', 'c']), ...clique(['d', 'e', 'f']), edge('c', 'd'), edge('g', 'a')];
    const first = detectCommunities(nodes, edges);
    expect(detectCommunities(nodes, edges)).toEqual(first);
    expect(sorted(detectCommunities(nodes, [...edges].reverse()).groups)).toEqual(sorted(first.groups));
  });

  it('merges the two triangles at a low resolution', () => {
    const nodes = nodesOf('a', 'b', 'c', 'd', 'e', 'f');
    const edges = [...clique(['a', 'b', 'c']), ...clique(['d', 'e', 'f']), edge('c', 'd')];
    expect(detectCommunities(nodes, edges, { resolution: 0.1 }).groups).toHaveLength(1);
  });

  it('recovers a planted partition of five blocks and stays fast on a large graph', () => {
    // Seeded LCG so the graph is the same on every run.
    let s = 12345;
    const rand = () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
    const blocks = 5, size = 30;
    const ids = Array.from({ length: blocks * size }, (_, i) => `n${i}`);
    const nodes = ids.map(node);
    const edges: GraphEdge[] = [];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const same = Math.floor(i / size) === Math.floor(j / size);
        if (rand() < (same ? 0.5 : 0.02)) edges.push(edge(ids[i], ids[j]));
      }
    }
    const started = performance.now();
    const { groups } = detectCommunities(nodes, edges);
    expect(performance.now() - started).toBeLessThan(1000);
    expect(groups).toHaveLength(blocks);
    for (const g of groups) {
      const counts = new Map<number, number>();
      for (const id of g) {
        const b = Math.floor(Number(id.slice(1)) / size);
        counts.set(b, (counts.get(b) ?? 0) + 1);
      }
      expect(Math.max(...counts.values()) / g.length).toBeGreaterThanOrEqual(0.9);
    }
  });
});
