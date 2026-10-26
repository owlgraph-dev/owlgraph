// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import { computeFitTransform, FIT_MAX_SCALE, type FitTarget } from './fit';

const project = (n: FitTarget, t: { scale: number; tx: number; ty: number }) => ({
  x: n.x * t.scale + t.tx,
  y: n.y * t.scale + t.ty,
});

describe('computeFitTransform', () => {
  it('frames two far-apart nodes within the viewport, centered', () => {
    const nodes: FitTarget[] = [
      { x: -1000, y: 0, r: 10 },
      { x: 1000, y: 0, r: 10 },
    ];
    const width = 800, height = 600;
    const t = computeFitTransform(nodes, width, height);
    for (const n of nodes) {
      const p = project(n, t);
      expect(p.x - n.r * t.scale).toBeGreaterThanOrEqual(-1e-6);
      expect(p.x + n.r * t.scale).toBeLessThanOrEqual(width + 1e-6);
      expect(p.y - n.r * t.scale).toBeGreaterThanOrEqual(-1e-6);
      expect(p.y + n.r * t.scale).toBeLessThanOrEqual(height + 1e-6);
    }
    const midX = (project(nodes[0], t).x + project(nodes[1], t).x) / 2;
    expect(midX).toBeCloseTo(width / 2, 5);
  });

  it('does not blow up scale for a single node', () => {
    const t = computeFitTransform([{ x: 5, y: 5, r: 10 }], 800, 600);
    expect(t.scale).toBeLessThanOrEqual(FIT_MAX_SCALE);
    expect(Number.isFinite(t.scale)).toBe(true);
    expect(Number.isFinite(t.tx)).toBe(true);
    expect(Number.isFinite(t.ty)).toBe(true);
  });

  it('returns an identity transform for no nodes or a zero-sized viewport', () => {
    expect(computeFitTransform([], 800, 600)).toEqual({ scale: 1, tx: 0, ty: 0 });
    expect(computeFitTransform([{ x: 0, y: 0, r: 5 }], 0, 0)).toEqual({ scale: 1, tx: 0, ty: 0 });
  });

  it('shrinks scale as content grows relative to a fixed viewport', () => {
    const width = 800, height = 600;
    const small = computeFitTransform([{ x: -50, y: 0, r: 5 }, { x: 50, y: 0, r: 5 }], width, height);
    const large = computeFitTransform([{ x: -5000, y: 0, r: 5 }, { x: 5000, y: 0, r: 5 }], width, height);
    expect(large.scale).toBeLessThan(small.scale);
  });
});
