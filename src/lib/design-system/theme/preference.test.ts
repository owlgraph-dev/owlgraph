// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, it } from 'vitest';
import { DEFAULT_COLOR_PREF, THEME_COLOR, resolveColorPref, themeColors } from './preference';

describe('resolveColorPref', () => {
  it('keeps a known preference', () => {
    expect(resolveColorPref('system')).toBe('system');
    expect(resolveColorPref('light')).toBe('light');
    expect(resolveColorPref('dark')).toBe('dark');
  });

  it('falls back to the default for a missing or unknown value', () => {
    for (const value of [undefined, null, '', 'Dark', 'auto', 'dark; path=/']) {
      expect(resolveColorPref(value)).toBe(DEFAULT_COLOR_PREF);
    }
  });

  it('defaults to the device scheme for a viewer who never chose', () => {
    expect(DEFAULT_COLOR_PREF).toBe('system');
  });
});

describe('themeColors', () => {
  it('follows an explicit choice in both media queries', () => {
    expect(themeColors('dark')).toEqual({ light: THEME_COLOR.dark, dark: THEME_COLOR.dark });
    expect(themeColors('light')).toEqual({ light: THEME_COLOR.light, dark: THEME_COLOR.light });
  });

  it('gives each media query its own scheme for system', () => {
    expect(themeColors('system')).toEqual({ light: THEME_COLOR.light, dark: THEME_COLOR.dark });
  });
});
