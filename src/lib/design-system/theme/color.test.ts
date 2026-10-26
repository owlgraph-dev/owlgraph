// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, it } from 'vitest';
import { composite, contrastRatio, parseColor, relativeLuminance } from './color';

describe('parseColor', () => {
  it('reads every hex length', () => {
    expect(parseColor('#fff')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseColor('#0008')).toEqual({ r: 0, g: 0, b: 0, a: 136 / 255 });
    expect(parseColor('#2563eb')).toEqual({ r: 37, g: 99, b: 235, a: 1 });
    expect(parseColor('#2563EB80')).toEqual({ r: 37, g: 99, b: 235, a: 128 / 255 });
  });

  it('reads rgb() and rgba() in comma and space syntax', () => {
    expect(parseColor('rgb(1, 2, 3)')).toEqual({ r: 1, g: 2, b: 3, a: 1 });
    expect(parseColor('rgba(0, 0, 0, 0.25)')).toEqual({ r: 0, g: 0, b: 0, a: 0.25 });
    expect(parseColor('rgb(10 20 30 / 50%)')).toEqual({ r: 10, g: 20, b: 30, a: 0.5 });
  });

  it('rejects what it cannot reason about', () => {
    for (const value of ['#12345', 'red', 'hsl(0 0% 0%)', 'var(--x)', '', 'rgb(1, 2)']) {
      expect(parseColor(value)).toBeNull();
    }
  });
});

describe('contrast', () => {
  const black = parseColor('#000')!;
  const white = parseColor('#fff')!;

  it('matches the WCAG extremes', () => {
    expect(relativeLuminance(black)).toBe(0);
    expect(relativeLuminance(white)).toBeCloseTo(1, 10);
    expect(contrastRatio(black, white)).toBeCloseTo(21, 10);
    expect(contrastRatio(white, white)).toBe(1);
  });

  it('matches the documented token ratios', () => {
    // docs/architecture/design-system/tokens.md: muted on bg 5.3:1, border-strong on bg 3.58:1.
    const bg = parseColor('#fbfbfa')!;
    expect(contrastRatio(parseColor('#68686d')!, bg)).toBeCloseTo(5.35, 2);
    expect(contrastRatio(parseColor('#858581')!, bg)).toBeCloseTo(3.58, 2);
  });
});

describe('composite', () => {
  it('lays a translucent colour over an opaque ground', () => {
    const half = composite(parseColor('rgba(0, 0, 0, 0.5)')!, parseColor('#fff')!);
    expect(half).toEqual({ r: 127.5, g: 127.5, b: 127.5, a: 1 });
  });

  it('leaves an opaque colour as it is', () => {
    expect(composite(parseColor('#2563eb')!, parseColor('#000')!)).toEqual({ r: 37, g: 99, b: 235, a: 1 });
  });
});

describe('OKLCH', () => {
  it('round-trips an sRGB colour', async () => {
    const { toOklch, fromOklch, toHex } = await import('./color');
    for (const hex of ['#2563eb', '#7aabff', '#b42318', '#ffffff', '#000000', '#808080']) {
      expect(toHex(fromOklch(toOklch(parseColor(hex)!)))).toBe(hex);
    }
  });

  it('keeps an out-of-gamut colour on screen by reducing chroma', async () => {
    const { fromOklch } = await import('./color');
    const c = fromOklch({ l: 0.9, c: 0.4, h: 264 });
    for (const v of [c.r, c.g, c.b]) expect(v >= 0 && v <= 255).toBe(true);
  });
});
