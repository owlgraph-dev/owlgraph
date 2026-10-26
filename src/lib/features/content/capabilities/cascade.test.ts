// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import { canvasTier, hasAnyOwnValue, resolveCapability } from './cascade';

type Bag = { a?: number | null; b?: string | null };

describe('hasAnyOwnValue', () => {
  it('is false for missing, empty or all-null data', () => {
    expect(hasAnyOwnValue<Bag>(undefined)).toBe(false);
    expect(hasAnyOwnValue<Bag>(null)).toBe(false);
    expect(hasAnyOwnValue<Bag>({})).toBe(false);
    expect(hasAnyOwnValue<Bag>({ desktop: {} })).toBe(false);
    expect(hasAnyOwnValue<Bag>({ desktop: { a: null }, phone: { b: null } })).toBe(false);
  });

  it('is true for an own value at any tier, not just the desktop tier', () => {
    expect(hasAnyOwnValue<Bag>({ desktop: { a: 1 } })).toBe(true);
    expect(hasAnyOwnValue<Bag>({ tablet: { b: 'x' } })).toBe(true);
    expect(hasAnyOwnValue<Bag>({ phone: { a: 0 } })).toBe(true);
  });

  it('restricts the check to the given fields', () => {
    const data = { desktop: { a: 1 }, tablet: { b: 'x' } };
    expect(hasAnyOwnValue<Bag>(data, ['b'])).toBe(true);
    expect(hasAnyOwnValue<Bag>({ desktop: { a: 1 } }, ['b'])).toBe(false);
  });
});

describe('resolveCapability', () => {
  it('merges field-by-field down the cascade', () => {
    const data = { desktop: { a: 1, b: 'd' }, tablet: { b: 't' } };
    expect(resolveCapability<Bag>(data, 'phone')).toEqual({ a: 1, b: 't' });
  });
});

describe('canvasTier', () => {
  it("names the tier a canvas of a width renders, on the container tiers' boundaries", () => {
    expect(canvasTier(360)).toBe('phone');
    expect(canvasTier(640)).toBe('phone');
    expect(canvasTier(641)).toBe('tablet');
    expect(canvasTier(844)).toBe('tablet');
    expect(canvasTier(900)).toBe('tablet');
    expect(canvasTier(932)).toBe('desktop');
  });
});
