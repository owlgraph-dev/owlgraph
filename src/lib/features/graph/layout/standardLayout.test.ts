// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import { createStandardLayout } from './standardLayout';
import { DEFAULT_FORCES } from './forceParams';
import type { GraphNode, GraphEdge } from '../types';

const node = (id: string): GraphNode => ({ id, title: id });
const edge = (source: string, target: string): GraphEdge => ({ source, target, edgeId: `${source}-${target}` });
const VIEWPORT = { w: 800, h: 600 };

function settle(engine: ReturnType<typeof createStandardLayout>, max = 2000): number {
  let steps = 0;
  while (engine.step() && steps < max) steps++;
  return steps;
}

const centroid = (pts: { x: number; y: number }[]) => ({
  x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
  y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
});

describe('createStandardLayout', () => {
  it('positions every node, reports no groups and no bridges', () => {
    const engine = createStandardLayout();
    const nodes = ['a', 'b', 'c'].map(node);
    engine.init(nodes, [edge('a', 'b'), edge('b', 'c')], VIEWPORT);
    expect([...engine.positions().keys()].sort()).toEqual(['a', 'b', 'c']);
    expect(engine.groups()).toEqual([]);
    expect(engine.crossGroupEdgeIndices().size).toBe(0);
  });

  it('cools down, stops, and restarts on reheat', () => {
    const engine = createStandardLayout();
    engine.init(['a', 'b'].map(node), [edge('a', 'b')], VIEWPORT);
    expect(settle(engine)).toBeLessThan(2000);
    expect(engine.step()).toBe(false);
    engine.reheat(0.5);
    expect(engine.step()).toBe(true);
  });

  it('pulls linked nodes to about the link distance and leaves them non-overlapping', () => {
    const engine = createStandardLayout();
    engine.init(['a', 'b'].map(node), [edge('a', 'b')], VIEWPORT);
    settle(engine);
    const a = engine.positions().get('a')!;
    const b = engine.positions().get('b')!;
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    // Repulsion pushes slightly past the rest length; the spring holds it near.
    expect(d).toBeGreaterThan(DEFAULT_FORCES.linkDistance * 0.8);
    expect(d).toBeLessThan(DEFAULT_FORCES.linkDistance * 2);
  });

  it('lets orphans settle in a halo outside the connected core', () => {
    const engine = createStandardLayout();
    const nodes = ['a', 'b', 'c', 'o1', 'o2', 'o3'].map(node);
    // A triangle around the origin, orphans outside it.
    const seed = new Map([
      ['a', { x: 100, y: 0 }], ['b', { x: -50, y: 87 }], ['c', { x: -50, y: -87 }],
      ['o1', { x: 400, y: 0 }], ['o2', { x: -200, y: 350 }], ['o3', { x: -200, y: -350 }],
    ]);
    engine.init(nodes, [edge('a', 'b'), edge('b', 'c'), edge('c', 'a')], VIEWPORT, seed);
    settle(engine);
    const pos = engine.positions();
    const core = ['a', 'b', 'c'].map((id) => pos.get(id)!);
    const c = centroid(core);
    const coreReach = Math.max(...core.map((p) => Math.hypot(p.x - c.x, p.y - c.y)));
    for (const id of ['o1', 'o2', 'o3']) {
      const p = pos.get(id)!;
      expect(Math.hypot(p.x - c.x, p.y - c.y)).toBeGreaterThan(coreReach);
    }
  });

  it('snaps a pinned node to its pin every frame until released', () => {
    const engine = createStandardLayout();
    engine.init(['a', 'b', 'c'].map(node), [edge('a', 'b'), edge('b', 'c')], VIEWPORT);
    engine.pin('b', 400, -300);
    for (let i = 0; i < 20; i++) engine.step();
    expect(engine.positions().get('b')).toEqual({ x: 400, y: -300 });
    engine.unpinAll();
    engine.reheat(1);
    for (let i = 0; i < 20; i++) engine.step();
    const b = engine.positions().get('b')!;
    expect(b.x === 400 && b.y === -300).toBe(false);
  });

  it('separates nodes seeded on top of each other without flinging them away', () => {
    const engine = createStandardLayout();
    const nodes = ['a', 'b', 'c', 'd'].map(node);
    const seed = new Map(nodes.map((n) => [n.id, { x: 100, y: 100 }]));
    engine.init(nodes, [edge('a', 'b')], VIEWPORT, seed);
    settle(engine);
    const pos = [...engine.positions().values()];
    for (const p of pos) {
      expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
      expect(Math.hypot(p.x, p.y)).toBeLessThan(DEFAULT_FORCES.linkDistance * 6);
    }
    for (let i = 0; i < pos.length; i++) {
      for (let j = i + 1; j < pos.length; j++) {
        expect(Math.hypot(pos[i].x - pos[j].x, pos[i].y - pos[j].y)).toBeGreaterThan(10);
      }
    }
  });

  it('continues from seeded positions and places a new node next to a seeded neighbour', () => {
    const engine = createStandardLayout();
    engine.init(['a', 'b'].map(node), [edge('a', 'b')], VIEWPORT);
    settle(engine);
    const seed = engine.positions();
    engine.init(['a', 'b', 'c'].map(node), [edge('a', 'b'), edge('b', 'c')], VIEWPORT, seed);
    const pos = engine.positions();
    expect(pos.get('a')).toEqual(seed.get('a'));
    expect(pos.get('b')).toEqual(seed.get('b'));
    const b = pos.get('b')!;
    const c = pos.get('c')!;
    expect(Math.hypot(c.x - b.x, c.y - b.y)).toBeLessThan(40);
  });
});
