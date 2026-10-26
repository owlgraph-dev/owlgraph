// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import { NO_DEFAULTS } from '../../capabilities/defaults/blockDefaults';
import { surfaceVars } from '../../capabilities/surface/surface';
import { pruneQuickLinkSurface, quickLinkDefaults, quickLinkSurface, quickLinkVariant } from './variants';

const CARDS = { ...NO_DEFAULTS, radius: 8 };

describe('quickLinkVariant', () => {
  it('reads the stored variant', () => {
    expect(quickLinkVariant({ variant: 'outlined', surface: { desktop: { bg: '#2563eb' } } })).toBe('outlined');
  });

  it('infers the old presets from the surface: a background was the button, a border the outline', () => {
    expect(quickLinkVariant({})).toBe('link');
    expect(quickLinkVariant({ surface: { desktop: { bg: 'token:accent' } } })).toBe('button');
    expect(quickLinkVariant({ surface: { phone: { bg: '#2563eb' } } })).toBe('button');
    expect(quickLinkVariant({ surface: { desktop: { border: '#475569' } } })).toBe('outlined');
    expect(quickLinkVariant({ surface: { desktop: { radius: 12, shadow: 'sm' } } })).toBe('link');
  });
});

describe('quickLinkSurface', () => {
  it('keeps only the fields the variant carries, tier by tier', () => {
    const attrs = { variant: 'outlined', surface: { desktop: { bg: '#2563eb', border: 'token:border', radius: 4 }, phone: { bg: '#000000' } } };
    expect(quickLinkSurface(attrs)).toEqual({ desktop: { border: 'token:border', radius: 4 } });
    expect(quickLinkSurface({ ...attrs, variant: 'link' })).toEqual({ desktop: { radius: 4 } });
    expect(quickLinkSurface({ ...attrs, variant: 'button' })).toEqual(attrs.surface);
  });
});

describe('quickLinkDefaults', () => {
  it("gives the theme's cards default where set, else the variant's built-in look, and nothing outside the variant", () => {
    expect(quickLinkDefaults('link', CARDS)).toEqual({ bg: null, border: null, radius: 8, shadow: null });
    expect(quickLinkDefaults('outlined', CARDS)).toEqual({ bg: null, border: 'token:border-strong', radius: 8, shadow: null });
    expect(quickLinkDefaults('button', CARDS)).toEqual({ bg: 'token:accent', border: null, radius: 8, shadow: null });
    expect(quickLinkDefaults('button', { ...CARDS, bg: 'token:brand.x', border: 'token:border' })).toEqual({ bg: 'token:brand.x', border: 'token:border', radius: 8, shadow: null });
    // A cards background never reaches a link or an outline.
    expect(quickLinkDefaults('outlined', { ...CARDS, bg: 'token:brand.x' }).bg).toBeNull();
  });

  it('makes the old button preset emit nothing: its accent is the built-in look', () => {
    const attrs = { surface: { desktop: { bg: 'token:accent' } } };
    expect(surfaceVars(quickLinkSurface(attrs), quickLinkDefaults(quickLinkVariant(attrs), CARDS), 'surface', 'card')).toEqual({});
  });
});

describe('pruneQuickLinkSurface', () => {
  it("drops the variant's redundant values and leaves the other fields pinned", () => {
    const attrs = { variant: 'outlined', surface: { desktop: { bg: '#2563eb', border: 'token:border-strong', radius: 8, shadow: 'md' as const } } };
    expect(pruneQuickLinkSurface(attrs, CARDS)).toEqual({ desktop: { bg: '#2563eb', shadow: 'md' } });
  });
});
