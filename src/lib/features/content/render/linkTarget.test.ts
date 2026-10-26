// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, it } from 'vitest';
import { linkTargetFromQuery, safeTargetHref } from './linkTarget';

describe('safeTargetHref', () => {
  it('lets an absolute http(s) or mailto address and a site path through', () => {
    expect(safeTargetHref('https://example.org/a')).toBe('https://example.org/a');
    expect(safeTargetHref('mailto:a@example.org')).toBe('mailto:a@example.org');
    expect(safeTargetHref(' /search?class=x ')).toBe('/search?class=x');
    expect(safeTargetHref('/')).toBe('/');
  });

  it('turns anything else into #', () => {
    expect(safeTargetHref('//evil.example/x')).toBe('#');
    expect(safeTargetHref('javascript:alert(1)')).toBe('#');
    expect(safeTargetHref('relative/path')).toBe('#');
    expect(safeTargetHref(null)).toBe('#');
  });
});

describe('linkTargetFromQuery', () => {
  it('takes a path on this site as it is', () => {
    expect(linkTargetFromQuery('/search')).toBe('/search');
    expect(linkTargetFromQuery(' /search?class=x ')).toBe('/search?class=x');
  });

  it('takes a URL, and a bare domain as https', () => {
    expect(linkTargetFromQuery('https://example.org/a')).toBe('https://example.org/a');
    expect(linkTargetFromQuery('example.com')).toBe('https://example.com');
  });

  it('is no address for a protocol-relative URL, words or a single word', () => {
    expect(linkTargetFromQuery('//evil.example')).toBe('');
    expect(linkTargetFromQuery('hello world')).toBe('');
    expect(linkTargetFromQuery('foo')).toBe('');
    expect(linkTargetFromQuery('')).toBe('');
  });
});
