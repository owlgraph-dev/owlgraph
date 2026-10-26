// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, it } from 'vitest';
import { pageWindow } from './pagination';

describe('pageWindow', () => {
  it('shows every page of a short list', () => {
    expect(pageWindow(1, 1)).toEqual([1]);
    expect(pageWindow(2, 3)).toEqual([1, 2, 3]);
    expect(pageWindow(1, 4)).toEqual([1, 2, 3, 4]);
    expect(pageWindow(3, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it('keeps the first and last page and the neighbours of the current one', () => {
    expect(pageWindow(1, 18)).toEqual([1, 2, 'gap', 18]);
    expect(pageWindow(9, 18)).toEqual([1, 'gap', 8, 9, 10, 'gap', 18]);
    expect(pageWindow(18, 18)).toEqual([1, 'gap', 17, 18]);
  });

  it('shows a single skipped page instead of a gap', () => {
    expect(pageWindow(4, 18)).toEqual([1, 2, 3, 4, 5, 'gap', 18]);
    expect(pageWindow(15, 18)).toEqual([1, 'gap', 14, 15, 16, 17, 18]);
  });

  it('clamps a page outside the range and yields nothing without pages', () => {
    expect(pageWindow(40, 3)).toEqual([1, 2, 3]);
    expect(pageWindow(0, 3)).toEqual([1, 2, 3]);
    expect(pageWindow(1, 0)).toEqual([]);
  });
});
