// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import {
  gridTierAttrs,
  normalizeColumnsByTier,
  normalizeGapByTier,
  ownGridColumns,
  reflowTiers,
  resolvedGridColumns,
  resolvedGridGap,
  withGridTierColumns,
  withGridTierGap,
} from './gridColumns';

const four = { columnWidths: [1, 1, 1, 1] };

describe('grid columns per tier', () => {
  it('keeps today\'s grid when nothing is set: the desktop\'s columns on a tablet, one column on a phone', () => {
    expect(resolvedGridColumns(four, 'desktop')).toEqual([1, 1, 1, 1]);
    expect(resolvedGridColumns(four, 'tablet')).toEqual([1, 1, 1, 1]);
    expect(resolvedGridColumns(four, 'phone')).toEqual([1]);
    expect(resolvedGridColumns({}, 'tablet')).toEqual([1, 1]);
    expect(reflowTiers(four)).toBe('p');
  });

  it('gives a tablet or a phone columns of its own, never more than the tier above', () => {
    const stats = { ...four, columnsByTier: { phone: [1, 1] } };
    expect(resolvedGridColumns(stats, 'phone')).toEqual([1, 1]);
    expect(reflowTiers(stats)).toBe('p');
    const tablet = { ...four, columnsByTier: { tablet: [2, 1], phone: [1, 1, 1] } };
    expect(resolvedGridColumns(tablet, 'tablet')).toEqual([2, 1]);
    // The phone's third column is cut to the tablet's two.
    expect(resolvedGridColumns(tablet, 'phone')).toEqual([1, 1]);
    expect(reflowTiers(tablet)).toBe('t p');
  });

  it('keeps merges and row heights on a phone only with the desktop\'s count of its own', () => {
    const icons = { columnWidths: [1, 6], columnsByTier: { phone: [1, 6] } };
    expect(resolvedGridColumns(icons, 'phone')).toEqual([1, 6]);
    expect(reflowTiers(icons)).toBe('');
    // A one-column grid stacks on a phone, rows reset.
    expect(reflowTiers({ columnWidths: [1] })).toBe('p');
  });

  it('ignores what does not hold up: ratios out of range, more columns than the tier above', () => {
    expect(resolvedGridColumns({ ...four, columnsByTier: { tablet: [0, 1] } }, 'tablet')).toEqual([1, 1, 1, 1]);
    expect(resolvedGridColumns({ ...four, columnsByTier: { tablet: [13] } }, 'tablet')).toEqual([1, 1, 1, 1]);
    expect(resolvedGridColumns({ columnWidths: [1, 1], columnsByTier: { tablet: [1, 1, 1] } }, 'tablet')).toEqual([1, 1]);
  });

  it('stores only what differs from what a tier would be anyway', () => {
    expect(normalizeColumnsByTier({ ...four, columnsByTier: { tablet: [1, 1, 1, 1], phone: [1] } })).toEqual({});
    expect(withGridTierColumns(four, 'tablet', [1, 1, 1, 1])).toBeNull();
    expect(withGridTierColumns(four, 'phone', [1, 1])).toEqual({ phone: [1, 1] });
    expect(withGridTierColumns({ ...four, columnsByTier: { phone: [1, 1] } }, 'phone', null)).toBeNull();
    expect(withGridTierColumns({ ...four, columnsByTier: { tablet: [1, 1, 1], phone: [1, 1, 1] } }, 'tablet', [1, 1])).toEqual({ tablet: [1, 1], phone: [1, 1] });
    expect(ownGridColumns({ ...four, columnsByTier: { tablet: [1, 1, 1, 1] } }, 'tablet')).toBeNull();
  });

  it('cuts the smaller tiers when a desktop column goes', () => {
    const grid = { columnWidths: [1, 1, 1], columnsByTier: { tablet: [1, 1, 1], phone: [1, 1, 1] } };
    // Both cut to two; the tablet's then equals the desktop's and goes.
    expect(gridTierAttrs({ ...grid, columnWidths: [1, 1] })).toEqual({ columnsByTier: { phone: [1, 1] }, gapByTier: null });
  });

  it('cascades the gap desktop-first and stores a tier only where it differs', () => {
    const grid = { columnWidths: [1, 1], gap: 'lg', gapByTier: { tablet: 'lg', phone: 'sm' } };
    expect(resolvedGridGap(grid, 'desktop')).toBe('lg');
    expect(resolvedGridGap(grid, 'tablet')).toBe('lg');
    expect(resolvedGridGap(grid, 'phone')).toBe('sm');
    expect(resolvedGridGap({}, 'phone')).toBe('md');
    expect(normalizeGapByTier(grid)).toEqual({ phone: 'sm' });
    expect(withGridTierGap(grid, 'phone', null)).toBeNull();
    expect(withGridTierGap({ columnWidths: [1, 1] }, 'tablet', 'none')).toEqual({ tablet: 'none' });
  });
});
