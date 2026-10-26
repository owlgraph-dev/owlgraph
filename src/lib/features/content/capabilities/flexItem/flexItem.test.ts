// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import { flexItemClass, flexItemVars, formatFlexBasis, normalizeFlexItem, parseFlexBasis, resolvedFlexItem, setFlexItemField, FLEX_ITEM_PROPS } from './flexItem';

describe('flex cell sizing and alignment', () => {
  it('stores and renders nothing for Auto — the cell stays content-sized, never wider than its row', () => {
    expect(flexItemVars(null)).toEqual({});
    expect(flexItemVars({})).toEqual({});
    expect(flexItemClass(undefined)).toBe('');
  });

  it('fills by weight, with its content as its minimum so the row wraps rather than squeezes', () => {
    expect(flexItemVars({ desktop: { size: 'fill' } })).toEqual({ '--flex-item-flex-d': '1 1 0%' });
    expect(flexItemVars({ desktop: { size: 'fill', weight: 2 } })).toEqual({ '--flex-item-flex-d': '2 1 0%' });
    expect(flexItemClass({ desktop: { size: 'fill' } })).toBe('cap-flex-item');
  });

  it('gives a fixed cell its own size, never wider than the row, yielding rather than overflowing', () => {
    expect(flexItemVars({ desktop: { size: 'fixed', basis: '320px' } })).toEqual({ '--flex-item-flex-d': '0 1 320px', '--flex-item-minw-d': '0', '--flex-item-w-d': '320px' });
    // Fixed with nothing to size by is Auto.
    expect(flexItemVars({ desktop: { size: 'fixed' } })).toEqual({});
    expect(flexItemVars({ desktop: { size: 'fixed', basis: '5000px' } })).toEqual({});
  });

  it('aligns across the container, Auto following the container', () => {
    expect(flexItemVars({ desktop: { self: 'center' } })).toEqual({ '--flex-item-self-d': 'center' });
    expect(flexItemVars({ phone: { self: 'end' } })).toEqual({ '--flex-item-self-p': 'flex-end' });
  });

  it('emits a smaller tier only where it differs from the tier above', () => {
    const data = { desktop: { size: 'fill' as const, weight: 2 as const } };
    expect(flexItemVars(setFlexItemField(data, 'phone', 'size', null))).toEqual({ '--flex-item-flex-d': '2 1 0%' });
    expect(flexItemVars({ desktop: { size: 'fill' }, tablet: { weight: 3 } })).toEqual({ '--flex-item-flex-d': '1 1 0%', '--flex-item-flex-t': '3 1 0%' });
    expect(flexItemVars({ desktop: { size: 'fixed', basis: '12rem' }, phone: { size: 'fill' } })).toEqual({
      '--flex-item-flex-d': '0 1 12rem',
      '--flex-item-minw-d': '0',
      '--flex-item-w-d': '12rem',
      '--flex-item-flex-p': '1 1 0%',
      '--flex-item-minw-p': 'auto',
      '--flex-item-w-p': 'auto',
    });
  });

  it('keeps a tier coherent when its size changes', () => {
    const fixed = setFlexItemField({}, 'desktop', 'size', 'fixed');
    expect(fixed).toEqual({ desktop: { size: 'fixed', basis: '240px' } });
    expect(setFlexItemField({ desktop: { size: 'fill', weight: 2 } }, 'desktop', 'size', 'fixed')).toEqual({ desktop: { size: 'fixed', basis: '240px' } });
    expect(setFlexItemField(fixed, 'desktop', 'size', 'fill')).toEqual({ desktop: { size: 'fill' } });
    expect(setFlexItemField(fixed, 'desktop', 'size', null)).toEqual({});
    // A tablet going Fixed inherits the desktop's basis rather than starting over.
    expect(setFlexItemField({ desktop: { size: 'fixed', basis: '10rem' }, tablet: { size: 'fill' } }, 'tablet', 'size', 'fixed')).toEqual({ desktop: { size: 'fixed', basis: '10rem' }, tablet: { size: 'fixed' } });
  });

  it('bounds a basis per unit and sanitizes what it is given', () => {
    expect(parseFlexBasis('40px')).toEqual({ value: 40, unit: 'px' });
    expect(parseFlexBasis('30px')).toBeNull();
    expect(parseFlexBasis('50%')).toEqual({ value: 50, unit: '%' });
    expect(parseFlexBasis('calc(1px)')).toBeNull();
    expect(formatFlexBasis(2000, 'px')).toBe('1200px');
    expect(formatFlexBasis(3.333, 'rem')).toBe('3.33rem');
    expect(normalizeFlexItem({ desktop: { size: 'grow', weight: 5, basis: 'url(x)', self: 'center' }, tablet: 'x' })).toEqual({ desktop: { self: 'center' } });
    expect(resolvedFlexItem({ desktop: { size: 'fill', weight: 2 }, phone: { weight: 3 } }, 'phone')).toEqual({ size: 'fill', weight: 3, basis: null, self: null });
  });

  it('owns exactly the properties it can emit', () => {
    expect(FLEX_ITEM_PROPS).toHaveLength(15);
  });
});
