// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import {
  convexHull,
  hullToPathD,
  inflatedHullPoints,
  computeGroupHulls,
  type InflatableNode,
} from './hull';

describe('convexHull', () => {
  it('returns the 4 corners for a square plus an interior point', () => {
    const square = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
      { x: 5, y: 5 }, // interior, must be excluded
    ];
    const hull = convexHull(square);
    expect(hull.length).toBe(4);
    expect(hull).not.toContainEqual({ x: 5, y: 5 });
  });

  it('handles collinear points without keeping the middle one', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 10, y: 0 },
      { x: 5, y: 10 },
    ];
    const hull = convexHull(points);
    expect(hull).not.toContainEqual({ x: 5, y: 0 });
    expect(hull.length).toBe(3);
  });

  it('returns input unchanged for fewer than 3 distinct points', () => {
    expect(convexHull([{ x: 1, y: 1 }])).toEqual([{ x: 1, y: 1 }]);
    expect(convexHull([{ x: 1, y: 1 }, { x: 1, y: 1 }])).toEqual([{ x: 1, y: 1 }]);
  });
});

describe('hullToPathD', () => {
  it('builds a closed M/L/Z path', () => {
    const d = hullToPathD([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]);
    expect(d).toBe('M 0 0 L 10 0 L 10 10 Z');
  });

  it('returns empty string for no points', () => {
    expect(hullToPathD([])).toBe('');
  });
});

describe('inflatedHullPoints + convexHull degrade gracefully', () => {
  const makeNode = (x: number, y: number): InflatableNode => ({
    x, y, r: 8, bl: -8, br: 40, bt: -8, bb: 8,
  });

  it('produces a non-degenerate closed hull for a single node', () => {
    const cloud = inflatedHullPoints([makeNode(0, 0)]);
    const hull = convexHull(cloud);
    expect(hull.length).toBeGreaterThanOrEqual(3);
    const d = hullToPathD(hull);
    expect(d.startsWith('M')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
  });

  it('produces a stadium-like closed hull for two nodes', () => {
    const cloud = inflatedHullPoints([makeNode(0, 0), makeNode(100, 0)]);
    const hull = convexHull(cloud);
    expect(hull.length).toBeGreaterThanOrEqual(3);
    const xs = hull.map((p) => p.x);
    expect(Math.min(...xs)).toBeLessThan(0);
    expect(Math.max(...xs)).toBeGreaterThan(100);
  });
});

describe('computeGroupHulls', () => {
  const nodesById = new Map<string, InflatableNode>([
    ['a', { x: 0, y: 0, r: 8, bl: -8, br: 30, bt: -8, bb: 8 }],
    ['b', { x: 50, y: 0, r: 8, bl: -8, br: 30, bt: -8, bb: 8 }],
    ['c', { x: 200, y: 200, r: 8, bl: -8, br: 30, bt: -8, bb: 8 }],
  ]);

  it('skips singleton groups by default', () => {
    const hulls = computeGroupHulls(nodesById, [['a', 'b'], ['c']]);
    expect(hulls.map((h) => h.groupIndex)).toEqual([0]);
  });

  it('produces a stable color for the same member set regardless of group index', () => {
    const hullsA = computeGroupHulls(nodesById, [['a', 'b']]);
    const hullsB = computeGroupHulls(nodesById, [['c'], ['a', 'b']], { minGroupSize: 1 });
    const colorForAB_first = hullsA[0].color;
    const colorForAB_second = hullsB.find((h) => h.groupIndex === 1)!.color;
    expect(colorForAB_first).toBe(colorForAB_second);
  });
});
