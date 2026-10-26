// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import { convertMinHeight, formatMinHeight, heightVars, normalizeHeightData, parseMinHeight, resolvedMinHeight, setHeightField } from './height';

describe('min-height', () => {
  it('parses px, rem and svh within bounds — nothing else', () => {
    expect(parseMinHeight('640px')).toEqual({ value: 640, unit: 'px' });
    expect(parseMinHeight('100svh')).toEqual({ value: 100, unit: 'svh' });
    expect(parseMinHeight('30rem')).toEqual({ value: 30, unit: 'rem' });
    expect(parseMinHeight('100vh')).toBeNull();
    expect(parseMinHeight('120svh')).toBeNull();
    expect(parseMinHeight('10px')).toBeNull();
    expect(parseMinHeight('calc(1px)')).toBeNull();
  });

  it('clamps when written back and converts px ↔ rem, restarting svh', () => {
    expect(formatMinHeight(5000, 'px')).toBe('2000px');
    expect(convertMinHeight({ value: 640, unit: 'px' }, 'rem')).toBe('40rem');
    expect(convertMinHeight({ value: 640, unit: 'px' }, 'svh')).toBe('60svh');
  });

  it('emits sparse: desktop against none, each tier against the one above', () => {
    expect(heightVars({})).toEqual({});
    expect(heightVars({ desktop: { min: '640px' } })).toEqual({ '--min-height-d': '640px' });
    expect(heightVars({ desktop: { min: '640px' }, phone: { min: '100svh' } })).toEqual({ '--min-height-d': '640px', '--min-height-p': '100svh' });
    expect(heightVars({ desktop: { min: '640px' }, tablet: { min: '640px' } })).toEqual({ '--min-height-d': '640px' });
  });

  it("'none' takes a larger tier's height back, and means nothing at desktop", () => {
    const data = { desktop: { min: '640px' }, phone: { min: 'none' } };
    expect(resolvedMinHeight(data, 'phone')).toBeNull();
    expect(heightVars(data)).toEqual({ '--min-height-d': '640px', '--min-height-p': 'auto' });
    expect(setHeightField({}, 'desktop', 'none')).toEqual({});
    expect(normalizeHeightData({ desktop: { min: 'none' }, tablet: { min: 'none' }, phone: { min: '1px' } })).toEqual({ tablet: { min: 'none' } });
  });
});
