// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, it } from 'vitest';
import { safePath, safeRedirect } from './safeRedirect';

const ORIGIN = 'https://kb.example.de';

describe('safeRedirect', () => {
  it('keeps a same-origin path with its query and hash', () => {
    expect(safeRedirect('/docs/intro?tab=2#top', ORIGIN)).toBe('/docs/intro?tab=2#top');
    expect(safeRedirect('/', ORIGIN)).toBe('/');
  });

  it('falls back to / without a usable value', () => {
    expect(safeRedirect(null, ORIGIN)).toBe('/');
    expect(safeRedirect('', ORIGIN)).toBe('/');
    expect(safeRedirect('docs', ORIGIN)).toBe('/');
  });

  it('refuses every spelling of another host', () => {
    for (const raw of [
      '//evil.example',
      '/\\evil.example',
      '/\\/evil.example',
      '/%5Cevil.example',
      'https://evil.example/',
      '/\t/evil.example',
      'javascript:alert(1)',
      '/.//evil.example/x',
      '/%2e//evil.example',
      '/a/..//evil.example',
      '/./..//evil.example',
    ]) {
      const dest = safeRedirect(raw, ORIGIN);
      expect(new URL(dest, ORIGIN).origin, raw).toBe(ORIGIN);
    }
  });

  it('refuses a path that dot segments turn into another host', () => {
    expect(safeRedirect('/.//evil.example/x', ORIGIN)).toBe('/');
    expect(safeRedirect('/a/..//evil.example', ORIGIN)).toBe('/');
    expect(safeRedirect('/a/./b', ORIGIN)).toBe('/a/b');
  });

  it('refuses a raw backslash outright', () => {
    expect(safeRedirect('/\\evil.example', ORIGIN)).toBe('/');
  });
});

describe('safePath', () => {
  it('is the same-origin path, / included', () => {
    expect(safePath('/docs/intro?tab=2#top', ORIGIN)).toBe('/docs/intro?tab=2#top');
    expect(safePath('/', ORIGIN)).toBe('/');
    expect(safePath('/a/./b', ORIGIN)).toBe('/a/b');
  });

  it('is nothing for a value that is no path on this origin', () => {
    for (const raw of [null, '', 'docs', '//evil.example', '/\\evil.example', 'https://evil.example/', 'javascript:alert(1)', '/.//evil.example/x', '/a/..//evil.example']) {
      expect(safePath(raw, ORIGIN), String(raw)).toBeNull();
    }
  });
});
