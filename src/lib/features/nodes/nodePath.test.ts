// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import { nodePath } from './nodePath';

describe('nodePath()', () => {
  it('default namespace (null/undefined) has no prefix', () => {
    expect(nodePath(null, 'foo')).toBe('/foo');
    expect(nodePath(undefined, 'foo')).toBe('/foo');
  });

  it('a namespace slug is prepended as a path segment', () => {
    expect(nodePath('proj', 'foo')).toBe('/proj/foo');
  });

  it('edit appends /edit after the resolved path', () => {
    expect(nodePath(null, 'foo', { edit: true })).toBe('/foo/edit');
    expect(nodePath('proj', 'foo', { edit: true })).toBe('/proj/foo/edit');
  });

  it('empty string namespace is treated as "no prefix", same as null', () => {
    expect(nodePath('', 'foo')).toBe('/foo');
  });
});
