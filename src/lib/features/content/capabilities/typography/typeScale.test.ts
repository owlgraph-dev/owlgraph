// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  TYPE_SCALE,
  TYPE_SCALE_STEPS,
  FLUID_MIN_CANVAS,
  FLUID_MAX_CANVAS,
  fluidLine,
  typeScaleCss,
  scaleRef,
  scaleStepOf,
  sizeOrNull,
  sizeCss,
  sizeLabel,
  typeScaleOptions,
} from './typeScale';

describe('scale references', () => {
  it('round-trips a step through its stored form', () => {
    expect(scaleRef('2xl')).toBe('scale:2xl');
    expect(scaleStepOf('scale:2xl')).toBe('2xl');
  });

  it('rejects unknown steps, bare steps and non-strings', () => {
    expect(scaleStepOf('scale:7xl')).toBeNull();
    expect(scaleStepOf('scale:')).toBeNull();
    expect(scaleStepOf('2xl')).toBeNull();
    expect(scaleStepOf(24)).toBeNull();
  });
});

describe('sizeOrNull', () => {
  it('keeps a known step reference', () => {
    expect(sizeOrNull('scale:m')).toBe('scale:m');
  });

  it('clamps a px number or numeric string to the literal range', () => {
    expect(sizeOrNull(20)).toBe(20);
    expect(sizeOrNull('20')).toBe(20);
    expect(sizeOrNull(200)).toBe(96);
    expect(sizeOrNull(2)).toBe(8);
    expect(sizeOrNull(14.4)).toBe(14);
  });

  it('rejects everything else', () => {
    expect(sizeOrNull('scale:7xl')).toBeNull();
    expect(sizeOrNull('scale:')).toBeNull();
    expect(sizeOrNull('')).toBeNull();
    expect(sizeOrNull('big')).toBeNull();
    expect(sizeOrNull(NaN)).toBeNull();
    expect(sizeOrNull(null)).toBeNull();
    expect(sizeOrNull(undefined)).toBeNull();
  });
});

describe('sizeCss / sizeLabel', () => {
  it('renders a step as its token and a literal as px', () => {
    expect(sizeCss('scale:5xl')).toBe('var(--type-5xl)');
    expect(sizeCss(14)).toBe('14px');
  });

  it('names a step by its key and a literal by its px', () => {
    expect(sizeLabel('scale:xs')).toBe('xs');
    expect(sizeLabel(14)).toBe('14px');
  });
});

describe('the fluid steps', () => {
  // The size a fluid token computes to on a canvas of `width` px, rem = 16px.
  function at(step: (typeof TYPE_SCALE_STEPS)[number], width: number): number {
    const { rem, minRem } = TYPE_SCALE[step];
    const line = fluidLine(step)!;
    const preferred = line.interceptRem * 16 + (line.slopeCqi * width) / 100;
    return Math.min(rem * 16, Math.max(minRem! * 16, preferred));
  }

  const fluid = TYPE_SCALE_STEPS.filter((step) => TYPE_SCALE[step].minRem != null);

  it('are exactly 3xl–6xl', () => {
    expect(fluid).toEqual(['3xl', '4xl', '5xl', '6xl']);
  });

  it('reach their floor at the narrow anchor and their full size at the wide one', () => {
    for (const step of fluid) {
      expect(at(step, FLUID_MIN_CANVAS)).toBeCloseTo(TYPE_SCALE[step].minRem! * 16, 2);
      expect(at(step, FLUID_MAX_CANVAS)).toBeCloseTo(TYPE_SCALE[step].rem * 16, 2);
    }
  });

  it('stay in order at every canvas width', () => {
    for (let width = 280; width <= 1400; width += 20) {
      const sizes = TYPE_SCALE_STEPS.map((step) => (TYPE_SCALE[step].minRem != null ? at(step, width) : TYPE_SCALE[step].rem * 16));
      for (let i = 1; i < sizes.length; i++) expect(sizes[i]).toBeGreaterThan(sizes[i - 1]);
    }
  });

  it('are emitted as clamp() in cqi, static steps as plain rem', () => {
    expect(typeScaleCss('m')).toBe('1rem');
    expect(typeScaleCss('3xl')).toBe('clamp(1.625rem, 1.475rem + 0.667cqi, 1.875rem)');
    expect(typeScaleCss('6xl')).toBe('clamp(2.5rem, 1.75rem + 3.333cqi, 3.75rem)');
  });
});

describe('app.css parity', () => {
  const css = readFileSync(new URL('../../../../../app.css', import.meta.url), 'utf8');

  it('declares every --type-* token with exactly the value typeScale.ts generates', () => {
    for (const step of TYPE_SCALE_STEPS) {
      expect(css).toContain(`--type-${step}: ${typeScaleCss(step)};`);
    }
  });

  it('pins every fluid step to its full size in print', () => {
    const print = css.slice(css.indexOf('@media print'));
    for (const step of TYPE_SCALE_STEPS.filter((s) => TYPE_SCALE[s].minRem != null)) {
      expect(print).toContain(`--type-${step}: ${TYPE_SCALE[step].rem}rem;`);
    }
  });
});

describe('typeScaleOptions', () => {
  it('lists every step, stored as a reference, hinted with its real size', () => {
    const options = typeScaleOptions();
    expect(options.map((o) => o.label)).toEqual([...TYPE_SCALE_STEPS]);
    expect(options[5]).toMatchObject({ value: 'scale:2xl', label: '2xl', hint: '1.5rem' });
  });

  it('previews on a bounded ramp that still grows step by step', () => {
    const previews = typeScaleOptions().map((o) => parseFloat(o.preview));
    expect(previews[0]).toBe(0.8125);
    expect(previews.at(-1)).toBe(1.625);
    for (let i = 1; i < previews.length; i++) expect(previews[i]).toBeGreaterThan(previews[i - 1]);
  });
});
