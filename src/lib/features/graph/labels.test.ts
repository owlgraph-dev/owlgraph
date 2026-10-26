// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import { hubNodeIds, labelOpacity, LABEL_FADE_END, LABEL_FADE_START } from './labels';

const withDegrees = (degs: number[]) => degs.map((deg, i) => ({ id: `n${i}`, deg }));

describe('hubNodeIds', () => {
  it('labels the top fraction by degree, tie-inclusive', () => {
    // 10 nodes, fraction 0.2 → rank 2 → threshold = 2nd-highest degree (5);
    // three nodes share degree 5, all of them count.
    const hubs = hubNodeIds(withDegrees([9, 5, 5, 5, 3, 2, 1, 1, 0, 0]));
    expect(hubs).toEqual(new Set(['n0', 'n1', 'n2', 'n3']));
  });

  it('never labels below the minimum degree', () => {
    const hubs = hubNodeIds(withDegrees([1, 1, 1, 0, 0]));
    expect(hubs.size).toBe(0);
  });

  it('is empty for an all-orphan graph and for no nodes', () => {
    expect(hubNodeIds(withDegrees([0, 0, 0])).size).toBe(0);
    expect(hubNodeIds([]).size).toBe(0);
  });

  it('raises the threshold to respect the cap', () => {
    const nodes = withDegrees([...Array(60).fill(3), ...Array(10).fill(7)]);
    const hubs = hubNodeIds(nodes, { fraction: 0.5, minDegree: 2, cap: 20 });
    expect(hubs.size).toBe(10);
    for (const id of hubs) expect(nodes.find((n) => n.id === id)!.deg).toBe(7);
  });

  it('accepts more than the cap when only the top degree remains', () => {
    const nodes = withDegrees(Array(50).fill(4));
    expect(hubNodeIds(nodes, { fraction: 0.2, minDegree: 2, cap: 10 }).size).toBe(50);
  });
});

describe('labelOpacity', () => {
  const base = { isHub: false, scale: 0.3, inFocus: false, hovered: false };

  it('always shows the focused neighbourhood and the hovered node', () => {
    expect(labelOpacity('never', { ...base, inFocus: true })).toBe(1);
    expect(labelOpacity('never', { ...base, hovered: true })).toBe(1);
  });

  it('respects always / never', () => {
    expect(labelOpacity('always', base)).toBe(1);
    expect(labelOpacity('never', { ...base, isHub: true, scale: 5 })).toBe(0);
  });

  it('in zoom mode shows hubs at any scale and fades the rest in with zoom', () => {
    expect(labelOpacity('zoom', { ...base, isHub: true })).toBe(1);
    expect(labelOpacity('zoom', { ...base, scale: LABEL_FADE_START })).toBe(0);
    expect(labelOpacity('zoom', { ...base, scale: (LABEL_FADE_START + LABEL_FADE_END) / 2 })).toBeCloseTo(0.5);
    expect(labelOpacity('zoom', { ...base, scale: LABEL_FADE_END })).toBe(1);
    expect(labelOpacity('zoom', { ...base, scale: 3 })).toBe(1);
  });
});
