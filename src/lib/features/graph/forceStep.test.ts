// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import {
  applyRepulsion,
  applySprings,
  applyCohesion,
  integrate,
  resolveLabelOverlap,
  resolveCircleOverlap,
  resolveCircleOverlapCross,
  type SimNode,
} from './forceStep';

const mkNode = (x: number, y: number): SimNode => ({
  x, y, vx: 0, vy: 0, fx: null, fy: null, bl: -5, br: 5, bt: -5, bb: 5,
});

describe('applyRepulsion', () => {
  it('pushes two coincident nodes apart', () => {
    const a = mkNode(0, 0);
    const b = mkNode(0, 0.001); // near-coincident to avoid a literal 0/0 direction
    applyRepulsion([a, b], 110);
    expect(a.vy).not.toBe(0);
    expect(b.vy).not.toBe(0);
    expect(Math.sign(a.vy)).not.toBe(Math.sign(b.vy));
  });

  it('applies negligible force to nodes already far beyond k', () => {
    const a = mkNode(0, 0);
    const b = mkNode(100000, 0);
    applyRepulsion([a, b], 110);
    expect(Math.abs(a.vx)).toBeLessThan(1e-6);
  });
});

describe('applySprings', () => {
  it('pulls connected nodes closer to the ideal distance', () => {
    const a = mkNode(0, 0);
    const b = mkNode(500, 0);
    applySprings([a, b], [{ aIndex: 0, bIndex: 1 }], 110);
    expect(a.vx).toBeGreaterThan(0);
    expect(b.vx).toBeLessThan(0);
  });
});

describe('applyCohesion', () => {
  it('pulls nodes toward their mutual centroid', () => {
    const a = mkNode(-100, 0);
    const b = mkNode(100, 0);
    applyCohesion([a, b], { strength: 0.1 });
    expect(a.vx).toBeGreaterThan(0);
    expect(b.vx).toBeLessThan(0);
  });

  it('is a no-op for a single node (its own centroid is itself)', () => {
    const a = mkNode(500, 300);
    applyCohesion([a], { strength: 0.1 });
    expect(a.vx).toBe(0);
    expect(a.vy).toBe(0);
  });

  it('does nothing for an empty array', () => {
    expect(() => applyCohesion([], { strength: 0.1 })).not.toThrow();
  });
});

describe('massFor (repulsion + springs)', () => {
  it('applyRepulsion: default (no massFor) moves both sides equally', () => {
    const a = mkNode(0, 0);
    const b = mkNode(0, 0.001);
    applyRepulsion([a, b], 110);
    expect(Math.abs(a.vy)).toBeCloseTo(Math.abs(b.vy), 10);
  });

  it('applyRepulsion: a heavier side accelerates less than a lighter one', () => {
    const heavy = mkNode(0, 0);
    const light = mkNode(0, 0.001);
    const masses = new Map([[heavy, 10], [light, 1]]);
    applyRepulsion([heavy, light], 110, 0.02, undefined, (n) => masses.get(n)!);
    expect(Math.abs(light.vy)).toBeGreaterThan(Math.abs(heavy.vy));
  });

  it('applySprings: a heavier side moves less than a lighter one toward the rest length', () => {
    const heavy = mkNode(0, 0);
    const light = mkNode(500, 0);
    const masses = new Map([[heavy, 10], [light, 1]]);
    applySprings([heavy, light], [{ aIndex: 0, bIndex: 1 }], 110, 0.01, undefined, (n) => masses.get(n)!);
    expect(Math.abs(light.vx)).toBeGreaterThan(Math.abs(heavy.vx));
  });
});

describe('integrate', () => {
  it('snaps pinned nodes to their pin and zeroes velocity', () => {
    const n: SimNode = { ...mkNode(0, 0), vx: 5, vy: 5, fx: 42, fy: 24 };
    integrate([n], { centerX: 0, centerY: 0, alpha: 1 });
    expect(n.x).toBe(42);
    expect(n.y).toBe(24);
    expect(n.vx).toBe(0);
    expect(n.vy).toBe(0);
  });

  it('moves unpinned nodes toward the centre over time', () => {
    const n = mkNode(1000, 0);
    for (let i = 0; i < 50; i++) integrate([n], { centerX: 0, centerY: 0, alpha: 1 });
    expect(n.x).toBeLessThan(1000);
  });

  it('centerStrengthFor lets a "heavier" node move toward centre faster than a lighter one', () => {
    const heavy = mkNode(1000, 0);
    const light = mkNode(1000, 0);
    const strengths = new Map([[heavy, 0.01], [light, 0.001]]);
    for (let i = 0; i < 20; i++) {
      integrate([heavy, light], {
        centerX: 0, centerY: 0, alpha: 1,
        centerStrengthFor: (n) => strengths.get(n)!,
      });
    }
    expect(heavy.x).toBeLessThan(light.x);
  });

  it('centerStrengthFor overrides the flat centerStrength when both are given', () => {
    const n = mkNode(1000, 0);
    integrate([n], { centerX: 0, centerY: 0, alpha: 1, centerStrength: 0, centerStrengthFor: () => 0.01 });
    expect(n.x).toBeLessThan(1000);
  });
});

describe('resolveLabelOverlap', () => {
  it('separates two overlapping label boxes', () => {
    const a = mkNode(0, 0);
    const b = mkNode(2, 0); // within the half-extents (5 each)
    resolveLabelOverlap([a, b]);
    expect(Math.abs(a.x - b.x)).toBeGreaterThan(2);
  });

  it('does not move two pinned nodes', () => {
    const a: SimNode = { ...mkNode(0, 0), fx: 0, fy: 0 };
    const b: SimNode = { ...mkNode(2, 0), fx: 2, fy: 0 };
    resolveLabelOverlap([a, b]);
    expect(a.x).toBe(0);
    expect(b.x).toBe(2);
  });
});

describe('resolveCircleOverlap', () => {
  it('ends with no overlap between two circles', () => {
    const a = { ...mkNode(0, 0), radius: 20 };
    const b = { ...mkNode(10, 0), radius: 20 };
    resolveCircleOverlap([a, b], 5);
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    expect(dist).toBeGreaterThanOrEqual(20 + 20 + 5 - 1e-6);
  });

  it('leaves non-overlapping circles untouched', () => {
    const a = { ...mkNode(0, 0), radius: 10 };
    const b = { ...mkNode(1000, 0), radius: 10 };
    resolveCircleOverlap([a, b], 5);
    expect(a.x).toBe(0);
    expect(b.x).toBe(1000);
  });

  it('with massFor, a heavier circle absorbs a smaller share of the correction', () => {
    const heavy = { ...mkNode(0, 0), radius: 20 };
    const light = { ...mkNode(10, 0), radius: 20 };
    const masses = new Map([[heavy, 10], [light, 1]]);
    resolveCircleOverlap([heavy, light], 5, (n) => masses.get(n)!);
    expect(Math.abs(heavy.x - 0)).toBeLessThan(Math.abs(light.x - 10));
  });

  it('mass-weighting does not override a pin — pinned side never moves', () => {
    const heavy = { ...mkNode(0, 0), radius: 20 };
    const pinnedLight = { ...mkNode(10, 0), radius: 20, fx: 10, fy: 0 };
    const masses = new Map([[heavy, 10], [pinnedLight, 1]]);
    resolveCircleOverlap([heavy, pinnedLight], 5, (n) => masses.get(n)!);
    expect(pinnedLight.x).toBe(10);
    expect(heavy.x).toBeLessThan(0);
  });

  it('with correctionFactor < 1, only partially resolves the overlap in one call', () => {
    const a = { ...mkNode(0, 0), radius: 20 };
    const b = { ...mkNode(10, 0), radius: 20 };
    const minDist = 20 + 20 + 5;
    resolveCircleOverlap([a, b], 5, undefined, 0.3);
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    expect(dist).toBeGreaterThan(10);
    expect(dist).toBeLessThan(minDist);
  });

  it('default correctionFactor (1) still fully resolves in one call', () => {
    const a = { ...mkNode(0, 0), radius: 20 };
    const b = { ...mkNode(10, 0), radius: 20 };
    resolveCircleOverlap([a, b], 5);
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    expect(dist).toBeGreaterThanOrEqual(20 + 20 + 5 - 1e-6);
  });
});

describe('resolveCircleOverlapCross', () => {
  it('corrects overlap between the two sets', () => {
    const a = { ...mkNode(0, 0), radius: 20 };
    const b = { ...mkNode(10, 0), radius: 20 };
    resolveCircleOverlapCross([a], [b], 5);
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    expect(dist).toBeGreaterThanOrEqual(20 + 20 + 5 - 1e-6);
  });

  it('leaves pairs WITHIN the same set untouched', () => {
    const a1 = { ...mkNode(0, 0), radius: 20 };
    const a2 = { ...mkNode(5, 0), radius: 20 }; // overlapping a1, in the same set
    const b = { ...mkNode(1000, 0), radius: 20 };
    resolveCircleOverlapCross([a1, a2], [b], 5);
    expect(a1.x).toBe(0);
    expect(a2.x).toBe(5);
  });

  it('applies correctionFactor gradually, same as resolveCircleOverlap', () => {
    const a = { ...mkNode(0, 0), radius: 20 };
    const b = { ...mkNode(10, 0), radius: 20 };
    const minDist = 20 + 20 + 5;
    resolveCircleOverlapCross([a], [b], 5, undefined, 0.3);
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    expect(dist).toBeGreaterThan(10);
    expect(dist).toBeLessThan(minDist);
  });
});
