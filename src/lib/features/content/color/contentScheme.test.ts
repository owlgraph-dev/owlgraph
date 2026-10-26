// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, it } from 'vitest';
import { canvasScheme, isContentScheme, resolveContentScheme } from './contentScheme';

describe('resolveContentScheme', () => {
  it('takes the nearest choice along page → namespace → site', () => {
    expect(resolveContentScheme({ page: 'dark', namespace: 'adaptive', site: 'light' })).toBe('dark');
    expect(resolveContentScheme({ page: null, namespace: 'adaptive', site: 'light' })).toBe('adaptive');
    expect(resolveContentScheme({ page: null, namespace: null, site: 'dark' })).toBe('dark');
  });

  it('falls back to light when nothing chose', () => {
    expect(resolveContentScheme({})).toBe('light');
    expect(resolveContentScheme({ page: null, site: null })).toBe('light');
  });
});

describe('canvasScheme', () => {
  it('pins light and dark, and leaves adaptive to the viewer', () => {
    expect(canvasScheme('light')).toBe('light');
    expect(canvasScheme('dark')).toBe('dark');
    expect(canvasScheme('adaptive')).toBeUndefined();
  });
});

describe('isContentScheme', () => {
  it('accepts only the three schemes', () => {
    for (const v of ['light', 'dark', 'adaptive']) expect(isContentScheme(v)).toBe(true);
    for (const v of ['system', '', null, undefined, 'Light']) expect(isContentScheme(v)).toBe(false);
  });
});
