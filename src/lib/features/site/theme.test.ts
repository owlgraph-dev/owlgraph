// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, it } from 'vitest';
import { validateThemeColors } from './theme.server';

const base = { accent: null, lightAccent: null, darkAccent: null, appbarLight: null, appbarDark: null, footerLight: null, footerDark: null, brand: [] };

describe('validateThemeColors', () => {
  it('stores an accent and brand colours, assigning ids to new ones and keeping existing ids', () => {
    const result = validateThemeColors(
      { version: 1, logoDarkAssetId: '6f1c2a0e-2b7a-4f7e-9a51-0d7c2f6f8a11' },
      { ...base, accent: '#E11D48', brand: [{ id: 'ocean', name: ' Ocean ', light: '#0B3D91', dark: '#8fb8ff' }, { id: null, name: 'Sand', light: '#c2a878', dark: '#6b5a3a' }] }
    );
    expect('theme' in result).toBe(true);
    if (!('theme' in result)) return;
    expect(result.theme.accent).toBe('#e11d48');
    expect(result.theme.brand?.[0]).toEqual({ id: 'ocean', name: 'Ocean', light: '#0b3d91', dark: '#8fb8ff' });
    expect(result.theme.brand?.[1].id).toMatch(/^[a-z0-9]{1,24}$/);
    // The dark logo is not the colours' to change.
    expect(result.theme.logoDarkAssetId).toBe('6f1c2a0e-2b7a-4f7e-9a51-0d7c2f6f8a11');
  });

  it('refuses a hand-set accent that misses its scheme\'s bars, naming what it misses', () => {
    const result = validateThemeColors({ version: 1 }, { ...base, lightAccent: '#ffd400' });
    expect('errors' in result && result.errors.lightAccent).toBe('contrast');
    expect('errors' in result && result.errors.shortfalls?.light?.map((s) => s.pair)).toContain('accent on bg');
  });

  it("keeps the app bar's and the footer's backgrounds per scheme", () => {
    const result = validateThemeColors({ version: 1 }, { ...base, appbarLight: '#0B3D91', appbarDark: '#0A2455', footerLight: '#E8E2D4', footerDark: '#1D2433' });
    expect('theme' in result && result.theme.appbar).toEqual({ light: '#0b3d91', dark: '#0a2455' });
    expect('theme' in result && result.theme.footer).toEqual({ light: '#e8e2d4', dark: '#1d2433' });
  });

  it('refuses a value that is not #rrggbb and a brand colour without a name', () => {
    expect('errors' in validateThemeColors({ version: 1 }, { ...base, accent: 'red' })).toBe(true);
    expect('errors' in validateThemeColors({ version: 1 }, { ...base, footerDark: 'black' })).toBe(true);
    expect('errors' in validateThemeColors({ version: 1 }, { ...base, appbarLight: 'navy' })).toBe(true);
    expect('errors' in validateThemeColors({ version: 1 }, { ...base, brand: [{ name: ' ', light: '#000000', dark: '#ffffff' }] })).toBe(true);
  });
});
