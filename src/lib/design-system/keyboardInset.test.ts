// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import { keyboardInset } from './keyboardInset';

describe('keyboardInset', () => {
  it('is the layout viewport below the visible part', () => {
    // A 844px phone whose keyboard leaves 524px visible.
    expect(keyboardInset(844, { height: 524, offsetTop: 0, scale: 1 })).toBe(320);
    // iOS scrolls the visual viewport down to the focused field: what lies
    // below its bottom edge is still the keyboard.
    expect(keyboardInset(844, { height: 524, offsetTop: 120, scale: 1 })).toBe(200);
  });

  it('is 0 when nothing covers the page', () => {
    expect(keyboardInset(844, { height: 844, offsetTop: 0, scale: 1 })).toBe(0);
    // The browser's toolbar slid away: the visible part is taller than the layout viewport.
    expect(keyboardInset(788, { height: 844, offsetTop: 0, scale: 1 })).toBe(0);
  });

  it('ignores a pinch-zoom, which shrinks the visual viewport without a keyboard', () => {
    expect(keyboardInset(844, { height: 422, offsetTop: 200, scale: 2 })).toBe(0);
  });
});
