// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import { createClusterLayout, communityCircle, HULL_GAP_RATIO, NODE_HULL_GAP_RATIO } from './clusterLayout';
import { createStandardLayout } from './standardLayout';
import { DEFAULT_FORCES } from './forceParams';
import { nodeRadius } from '../nodeGeometry';
import type { GraphNode, GraphEdge } from '../types';
import type { LayoutEngine } from './types';

const node = (id: string): GraphNode => ({ id, title: id });
const edge = (source: string, target: string): GraphEdge => ({ source, target, edgeId: `${source}-${target}` });
const VIEWPORT = { w: 800, h: 600 };
const k = DEFAULT_FORCES.linkDistance;

const clique = (ids: string[]): GraphEdge[] => {
  const out: GraphEdge[] = [];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) out.push(edge(ids[i], ids[j]));
  return out;
};

// Two triangles joined by one edge, plus a true orphan.
const nodes = ['a', 'b', 'c', 'd', 'e', 'f', 'solo'].map(node);
const edges = [...clique(['a', 'b', 'c']), ...clique(['d', 'e', 'f']), edge('c', 'd')];

function settle(engine: LayoutEngine, max = 2000): number {
  let steps = 0;
  while (engine.step() && steps < max) steps++;
  return steps;
}

// The community circles rebuilt from the engine's public state, as the view's hulls are.
function circles(engine: LayoutEngine, allEdges: GraphEdge[]) {
  const pos = engine.positions();
  const deg = new Map<string, number>();
  for (const e of allEdges) {
    deg.set(e.source, (deg.get(e.source) ?? 0) + 1);
    deg.set(e.target, (deg.get(e.target) ?? 0) + 1);
  }
  const sim = (id: string) => {
    const p = pos.get(id)!;
    const r = nodeRadius(deg.get(id) ?? 0);
    return { id, deg: deg.get(id) ?? 0, r, x: p.x, y: p.y, vx: 0, vy: 0, fx: null, fy: null, bl: -r, br: r, bt: -r, bb: r };
  };
  return engine
    .groups()
    .filter((g) => g.length > 1)
    .map((g) => ({ ids: g, circle: communityCircle(g.map(sim))! }));
}

describe('createClusterLayout', () => {
  it('positions every node, groups the communities and reports the cross-group edge', () => {
    const engine = createClusterLayout();
    engine.init(nodes, edges, VIEWPORT);
    const pos = engine.positions();
    expect([...pos.keys()].sort()).toEqual(nodes.map((n) => n.id).sort());
    const groups = engine.groups().map((g) => [...g].sort());
    expect(groups).toContainEqual(['a', 'b', 'c']);
    expect(groups).toContainEqual(['d', 'e', 'f']);
    expect(groups).toContainEqual(['solo']);
    expect(engine.crossGroupEdgeIndices()).toEqual(new Set([6]));
  });

  it('cools down to a stop and starts again on reheat', () => {
    const engine = createClusterLayout();
    engine.init(nodes, edges, VIEWPORT);
    expect(settle(engine)).toBeLessThan(2000);
    expect(engine.step()).toBe(false);
    engine.reheat(0.5);
    expect(engine.step()).toBe(true);
  });

  it('keeps community circles apart and lone nodes outside them once settled', () => {
    const engine = createClusterLayout();
    engine.init(nodes, edges, VIEWPORT);
    settle(engine);
    const cs = circles(engine, edges);
    expect(cs).toHaveLength(2);
    const [p, q] = cs.map((c) => c.circle);
    expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeGreaterThanOrEqual(p.radius + q.radius + HULL_GAP_RATIO * k - 2);
    const solo = engine.positions().get('solo')!;
    for (const { circle } of cs) {
      expect(Math.hypot(solo.x - circle.x, solo.y - circle.y)).toBeGreaterThanOrEqual(circle.radius + nodeRadius(0) + NODE_HULL_GAP_RATIO * k - 2);
    }
  });

  it('leaves no two node circles overlapping on three cliques plus orphans', () => {
    const cliques = [['a1', 'a2', 'a3', 'a4', 'a5'], ['b1', 'b2', 'b3', 'b4', 'b5'], ['c1', 'c2', 'c3', 'c4', 'c5']];
    const orphans = Array.from({ length: 10 }, (_, i) => `o${i}`);
    const all = [...cliques.flat(), ...orphans].map(node);
    const es = [...cliques.flatMap(clique), edge('a1', 'b1'), edge('b2', 'c2')];
    const engine = createClusterLayout();
    engine.init(all, es, VIEWPORT);
    settle(engine);
    const pos = engine.positions();
    const deg = new Map<string, number>();
    for (const e of es) { deg.set(e.source, (deg.get(e.source) ?? 0) + 1); deg.set(e.target, (deg.get(e.target) ?? 0) + 1); }
    const ids = all.map((n) => n.id);
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const p = pos.get(ids[i])!, q = pos.get(ids[j])!;
        expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeGreaterThanOrEqual(nodeRadius(deg.get(ids[i]) ?? 0) + nodeRadius(deg.get(ids[j]) ?? 0) - 0.5);
      }
    }
    expect(engine.groups().filter((g) => g.length > 1)).toHaveLength(3);
  });

  it('settles every member nearest its own community centroid', () => {
    const engine = createClusterLayout();
    engine.init(nodes, edges, VIEWPORT);
    settle(engine);
    const cs = circles(engine, edges);
    const pos = engine.positions();
    for (const { ids, circle } of cs) {
      for (const id of ids) {
        const p = pos.get(id)!;
        const own = Math.hypot(p.x - circle.x, p.y - circle.y);
        for (const other of cs) {
          if (other.circle === circle) continue;
          expect(own).toBeLessThan(Math.hypot(p.x - other.circle.x, p.y - other.circle.y));
        }
      }
    }
  });

  it('snaps a pinned node to its pin every frame and releases it on unpinAll', () => {
    const engine = createClusterLayout();
    engine.init(nodes, edges, VIEWPORT);
    engine.pin('a', 1000, 900);
    for (let i = 0; i < 20; i++) engine.step();
    expect(engine.positions().get('a')).toEqual({ x: 1000, y: 900 });
    engine.unpinAll();
    engine.reheat(1);
    for (let i = 0; i < 300; i++) engine.step();
    const a = engine.positions().get('a')!;
    const b = engine.positions().get('b')!;
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(2 * k);
  });

  it('excludes a pinned (dragged) member from its community circle', () => {
    const mk = (id: string, x: number, y: number, pinned = false) =>
      ({ id, deg: 2, r: 9, x, y, vx: 0, vy: 0, fx: pinned ? x : null, fy: pinned ? y : null, bl: -9, br: 9, bt: -9, bb: 9 });
    const circle = communityCircle([mk('a', 5000, 5000, true), mk('b', 0, 0), mk('c', 60, 0)])!;
    expect(circle.x).toBeCloseTo(30);
    expect(circle.y).toBeCloseTo(0);
    expect(circle.radius).toBeLessThan(100);
    expect(circle.size).toBe(2);
    expect(communityCircle([mk('a', 1, 1, true)])).toBeNull();
  });

  it('continues from seeded positions and moves nothing far in the first step after a Standard layout', () => {
    const standard = createStandardLayout();
    standard.init(nodes, edges, VIEWPORT);
    settle(standard);
    const seed = standard.positions();
    const engine = createClusterLayout();
    engine.init(nodes, edges, VIEWPORT, seed);
    for (const [id, p] of seed) expect(engine.positions().get(id)).toEqual(p);
    engine.step();
    for (const [id, p] of seed) {
      const q = engine.positions().get(id)!;
      expect(Math.hypot(q.x - p.x, q.y - p.y)).toBeLessThan(k);
    }
  });

  it('is independent of the viewport', () => {
    const seed = new Map(nodes.map((n, i) => [n.id, { x: i * 50, y: (i % 3) * 40 }]));
    const a = createClusterLayout();
    const b = createClusterLayout();
    a.init(nodes, edges, { w: 800, h: 600 }, seed);
    b.init(nodes, edges, { w: 200, h: 200 }, seed);
    for (let i = 0; i < 100; i++) { a.step(); b.step(); }
    for (const [id, p] of a.positions()) expect(b.positions().get(id)).toEqual(p);
  });
});
