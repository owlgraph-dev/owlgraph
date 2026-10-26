// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, it } from 'vitest';
import { colorCss, colorToken, colorTokenName } from './colorTokens';
import { safeColor, safeLiteralColor } from '../capabilities/parse';
import { surfaceVars } from '../capabilities/surface/surface';
import { typographyVars } from '../capabilities/typography/typography';
import { DEFAULT_SCHEMES } from '$lib/design-system/theme/tokens';
import { CONTENT_COLOR_TOKENS, colorTokenProperty } from './colorTokens';

describe('colour references', () => {
  it('round-trips a known theme colour and rejects anything else', () => {
    expect(colorTokenName(colorToken('accent'))).toBe('accent');
    for (const v of ['token:', 'token:Accent', 'token:brand', 'accent', '#2563eb', null, 42]) expect(colorTokenName(v)).toBeNull();
  });

  it('renders a reference as its custom property and leaves a literal alone', () => {
    expect(colorCss('token:accent-soft')).toBe('var(--content-theme-accent-soft)');
    expect(colorCss('#1e293b')).toBe('#1e293b');
  });

  it('is defined in every scheme for every theme colour', () => {
    for (const scheme of ['light', 'dark'] as const) {
      const tokens = DEFAULT_SCHEMES[scheme] as Record<string, string>;
      for (const name of CONTENT_COLOR_TOKENS) expect(tokens[colorTokenProperty(name)], `${scheme} ${name}`).toBeTruthy();
    }
  });
});

describe('safeColor', () => {
  it('accepts literals and known references, nothing that could break a style', () => {
    expect(safeColor('#fff')).toBe('#fff');
    expect(safeColor('rgba(0, 0, 0, 0.5)')).toBe('rgba(0, 0, 0, 0.5)');
    expect(safeColor(' token:accent ')).toBe('token:accent');
    for (const v of ['token:nope', 'var(--x)', 'red', 'token:accent;color:red', '#fff;x', null]) expect(safeColor(v)).toBe('');
  });

  it('keeps a literal-only variant for colours that must be computed with', () => {
    expect(safeLiteralColor('#0f172a')).toBe('#0f172a');
    expect(safeLiteralColor('token:accent')).toBe('');
  });
});

describe('capability styles', () => {
  it('emit a referenced background and border as custom properties', () => {
    const css = surfaceVars({ desktop: { bg: 'token:inverse', border: 'token:border-strong' } });
    expect(css['--surface-bg-d']).toBe('var(--content-theme-inverse)');
    expect(css['--surface-border-d']).toBe('1px solid var(--content-theme-border-strong)');
  });

  it('emit a referenced text colour as a custom property', () => {
    expect(typographyVars({ desktop: { color: 'token:on-inverse' } }, {})['--typography-color-d']).toBe('var(--content-theme-on-inverse)');
  });
});

describe('brand colour references', () => {
  it('validate, render as their property, and pair with their own readable text', async () => {
    const { brandColorId, colorCss, fillTextProperty, isColorReference } = await import('./colorTokens');
    const { safeColor } = await import('../capabilities/parse');
    expect(brandColorId('token:brand.ocean')).toBe('ocean');
    expect(brandColorId('token:brand.Bad-Id')).toBeNull();
    expect(safeColor('token:brand.ocean')).toBe('token:brand.ocean');
    expect(safeColor('token:brand.x;y')).toBe('');
    expect(isColorReference('token:brand.ocean')).toBe(true);
    expect(colorCss('token:brand.ocean')).toBe('var(--content-brand-ocean)');
    expect(fillTextProperty('token:brand.ocean', 'block')).toBe('--content-brand-ocean-fg');
  });
});
