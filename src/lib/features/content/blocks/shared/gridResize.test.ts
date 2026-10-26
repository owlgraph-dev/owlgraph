// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import { flooredWeights, previewWeights, withAddedTrack } from './gridResize';

describe('previewWeights', () => {
  it('splits two equal-weight tracks evenly at fraction 0.5', () => {
    expect(previewWeights([1, 1], 0, 0.5)).toEqual([50, 50]);
  });

  it('redistributes an uneven fraction between the dragged pair', () => {
    expect(previewWeights([1, 1], 0, 0.25)).toEqual([25, 75]);
  });

  it('ignores the original weight ratio — fraction is relative to the pair\'s own span', () => {
    expect(previewWeights([3, 1], 0, 0.5)).toEqual([50, 50]);
  });

  it('clamps to the minimum floor at the low end', () => {
    expect(previewWeights([1, 1], 0, 0.01)).toEqual([5, 95]);
  });

  it('clamps to the minimum floor at the high end', () => {
    expect(previewWeights([1, 1], 0, 0.99)).toEqual([95, 5]);
  });

  it('leaves a third, untouched track at its own proportional share', () => {
    const r = previewWeights([1, 3, 2], 0, 0.5);
    expect(r[2]).toBe(33);
  });

  it('always rounds to whole numbers summing to exactly 100', () => {
    for (const fraction of [0, 0.1, 0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1]) {
      const r = previewWeights([1, 3, 2], 0, fraction);
      expect(r.reduce((a, b) => a + b, 0)).toBe(100);
      expect(r.every((n) => Number.isInteger(n))).toBe(true);
    }
  });

  it('operates on whichever adjacent pair k selects, leaving others alone', () => {
    const r = previewWeights([1, 1, 1, 1], 2, 0.25);
    expect(r[0]).toBe(25);
    expect(r[1]).toBe(25);
    expect(r[2] + r[3]).toBe(50);
    expect(r[2]).toBeLessThan(r[3]);
  });
});

describe('withAddedTrack', () => {
  it('gives the new track an even share, however the weights are scaled', () => {
    expect(withAddedTrack([1, 1])).toEqual([1, 1, 1]);
    // The percent-like weights a drag leaves: the new column is not a 1% sliver.
    expect(withAddedTrack([42, 25, 33])).toEqual([42, 25, 33, 33]);
  });
});

describe('flooredWeights', () => {
  it('raises a track narrower than a drag can make to the floor, and leaves the rest', () => {
    const w = flooredWeights([42, 25, 33, 1]);
    expect(w.slice(0, 3)).toEqual([42, 25, 33]);
    expect(w[3] / w.reduce((a, b) => a + b, 0)).toBeGreaterThan(0.045);
    expect(flooredWeights([1, 1, 2])).toEqual([1, 1, 2]);
  });

  it('falls back to equal tracks when there are more than the floor allows, or no weight', () => {
    const many = flooredWeights([100, ...new Array(24).fill(1)]);
    expect(Math.min(...many)).toBeCloseTo(Math.max(...many.slice(1)));
    expect(flooredWeights([0, 0])).toEqual([1, 1]);
  });
});

describe('previewWeights with a caller minimum', () => {
  it('stops at the caller minimum, rounded up so rounding never goes under it', () => {
    // 104px of a 928px table is 11.2%, so no column under 12%.
    expect(previewWeights([1, 1, 1], 0, 0, (104 / 928) * 100)).toEqual([12, 55, 33]);
    expect(previewWeights([1, 1, 1], 0, 1, (104 / 928) * 100)[1]).toBe(12);
  });

  it('splits a pair narrower than two minimums evenly', () => {
    expect(previewWeights([10, 10, 80], 0, 0, 20)).toEqual([10, 10, 80]);
  });
});
