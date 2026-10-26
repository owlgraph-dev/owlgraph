// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import { columnTiers, layoutVars, resolvedFlexDirection, resolvedFlexWrap, resolvedAlignItems, type LayoutDefaults } from './layout';

const COLUMN: LayoutDefaults = { flexDirection: 'column' };

describe('layoutVars', () => {
  it('emits nothing when nothing is set — the CSS literals and the kind pins are the defaults', () => {
    expect(layoutVars({})).toEqual({});
    expect(layoutVars(undefined)).toEqual({});
    expect(layoutVars({}, COLUMN)).toEqual({});
  });

  it('leaves out a desktop value equal to the default, and emits one that deviates', () => {
    expect(layoutVars({ desktop: { flexDirection: 'column', gap: 0 } }, COLUMN)).toEqual({});
    expect(layoutVars({ desktop: { flexDirection: 'column', gap: 16 } })).toEqual({ '--layout-direction-d': 'column', '--layout-gap-d': '16px' });
    expect(layoutVars({ desktop: { flexDirection: 'row' } }, COLUMN)).toEqual({ '--layout-direction-d': 'row' });
  });

  it('compares a tablet or phone value against the tier above, not the default', () => {
    // Tablet repeats the (host-defaulted) desktop value: redundant.
    expect(layoutVars({ tablet: { flexDirection: 'column' } }, COLUMN)).toEqual({});
    // Tablet deviates from desktop; phone goes back to what desktop has: both emitted.
    expect(layoutVars({ desktop: { flexWrap: 'wrap' }, tablet: { flexWrap: 'nowrap' }, phone: { flexWrap: 'wrap' } })).toEqual({
      '--layout-wrap-d': 'wrap',
      '--layout-wrap-t': 'nowrap',
      '--layout-wrap-p': 'wrap',
    });
  });

  it('ignores an invalid stored value', () => {
    expect(layoutVars({ desktop: { flexDirection: 'diagonal' as never } }, COLUMN)).toEqual({});
  });
});

describe('resolved* with kind defaults', () => {
  it('reports the kind default at every tier when nothing is set', () => {
    expect(resolvedFlexDirection({}, 'desktop', COLUMN)).toBe('column');
    expect(resolvedFlexDirection({}, 'phone', COLUMN)).toBe('column');
    expect(resolvedFlexDirection({}, 'phone')).toBe('row');
  });

  it('cascades an explicit tier value over the kind default', () => {
    expect(resolvedFlexDirection({ tablet: { flexDirection: 'row' } }, 'phone', COLUMN)).toBe('row');
    expect(resolvedFlexDirection({ tablet: { flexDirection: 'row' } }, 'desktop', COLUMN)).toBe('column');
  });

  it('leaves fields the host does not default on the capability defaults', () => {
    expect(resolvedFlexWrap({}, 'desktop', COLUMN)).toBe('nowrap');
    expect(resolvedAlignItems({}, 'desktop', COLUMN)).toBe('stretch');
  });
});

describe('columnTiers', () => {
  it('names the tiers at which a container runs as a column, none for a row', () => {
    expect(columnTiers(undefined)).toBe('');
    expect(columnTiers({ phone: { flexDirection: 'column' } })).toBe('p');
    expect(columnTiers({ desktop: { flexDirection: 'column-reverse' }, phone: { flexDirection: 'row' } })).toBe('d t');
    expect(columnTiers({}, { flexDirection: 'column' })).toBe('d t p');
  });
});

describe('a row that scrolls sideways (flexWrap scroll)', () => {
  it('renders as a nowrap row, so only a change of the CSS value emits a var', async () => {
    // Desktop's nowrap is the default: a phone that scrolls needs no wrap var, only its scroll tier.
    expect(layoutVars({ phone: { flexWrap: 'scroll' } })).toEqual({});
    expect(layoutVars({ desktop: { flexWrap: 'wrap' }, phone: { flexWrap: 'scroll' } })).toEqual({ '--layout-wrap-d': 'wrap', '--layout-wrap-p': 'nowrap' });
  });

  it('names the tiers it scrolls at, through the cascade, and only for a row', async () => {
    const { scrollTiers } = await import('./layout');
    expect(scrollTiers({ phone: { flexWrap: 'scroll' } })).toBe('p');
    expect(scrollTiers({ desktop: { flexWrap: 'scroll' }, phone: { flexWrap: 'wrap' } })).toBe('d t');
    expect(scrollTiers({ desktop: { flexWrap: 'scroll', flexDirection: 'column' } })).toBe('');
    expect(scrollTiers({ phone: { flexWrap: 'scroll' } }, COLUMN)).toBe('');
  });
});

describe('the arrangement — direction and wrap in one step', () => {
  it('reads a tier in one word and sets or clears both fields at once', async () => {
    const { resolvedArrangement, setLayoutArrangement, hasOwnArrangement } = await import('./layout');
    expect(resolvedArrangement({}, 'phone')).toBe('row');
    expect(resolvedArrangement({}, 'phone', COLUMN)).toBe('stack');
    const scrolling = setLayoutArrangement({ desktop: { flexWrap: 'wrap', gap: 8 } }, 'phone', 'scroll');
    expect(scrolling).toEqual({ desktop: { flexWrap: 'wrap', gap: 8 }, phone: { flexDirection: 'row', flexWrap: 'scroll' } });
    expect(resolvedArrangement(scrolling, 'phone')).toBe('scroll');
    expect(resolvedArrangement(scrolling, 'tablet')).toBe('wrap');
    expect(hasOwnArrangement(scrolling, 'tablet')).toBe(false);
    expect(setLayoutArrangement(scrolling, 'phone', null)).toEqual({ desktop: { flexWrap: 'wrap', gap: 8 } });
    expect(resolvedArrangement(setLayoutArrangement({}, 'desktop', 'stack'), 'phone')).toBe('stack');
  });
});
