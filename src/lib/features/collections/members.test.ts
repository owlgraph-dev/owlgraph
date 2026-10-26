// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import { compareMembers, isReorderOf, mergeVisibleOrder, nextPosition, positionOf } from './members';

describe('isReorderOf', () => {
  it('accepts the same members in any order, and nothing else', () => {
    expect(isReorderOf(['a', 'b', 'c'], ['c', 'a', 'b'])).toBe(true);
    expect(isReorderOf([], [])).toBe(true);
    expect(isReorderOf(['a', 'b'], ['a'])).toBe(false);
    expect(isReorderOf(['a', 'b'], ['a', 'a'])).toBe(false);
    expect(isReorderOf(['a', 'b'], ['a', 'x'])).toBe(false);
    expect(isReorderOf(['a', 'b'], ['a', 'b', 'c'])).toBe(false);
  });
});

describe('mergeVisibleOrder', () => {
  it("rearranges what the editor sees into the slots it held, leaving every other member's slot as it was", () => {
    // h1 and h2 are members the editor may not read.
    const all = ['a', 'h1', 'b', 'c', 'h2'];
    const visible = new Set(['a', 'b', 'c']);
    expect(mergeVisibleOrder(all, visible, ['c', 'a', 'b'])).toEqual(['c', 'h1', 'a', 'b', 'h2']);
    expect(mergeVisibleOrder(all, visible, ['a', 'b', 'c'])).toEqual(all);
  });

  it('leaves a collection the editor sees nothing of as it is', () => {
    expect(mergeVisibleOrder(['h1', 'h2'], new Set(), [])).toEqual(['h1', 'h2']);
  });
});

describe('positionOf', () => {
  it('reads a whole number, and nothing else', () => {
    expect(positionOf('3')).toBe(3);
    expect(positionOf(' 12 ')).toBe(12);
    expect(positionOf('-1')).toBe(-1);
    expect(positionOf('2.5')).toBeNull();
    expect(positionOf('two')).toBeNull();
    expect(positionOf('')).toBeNull();
    expect(positionOf(null)).toBeNull();
  });
});

describe('nextPosition', () => {
  it('is one past the largest position held', () => {
    expect(nextPosition([])).toBe(1);
    expect(nextPosition(['1', '2'])).toBe(3);
    expect(nextPosition(['7', '2'])).toBe(8);
  });

  it('ignores values that are not positions', () => {
    expect(nextPosition(['x', null, '4', '4.5'])).toBe(5);
  });
});

describe('compareMembers', () => {
  it('orders by position, a member without one last, then by title', () => {
    const members = [
      { position: null, title: 'B' },
      { position: 2, title: 'Second' },
      { position: 1, title: 'First' },
      { position: null, title: 'A' },
    ];
    expect([...members].sort(compareMembers).map((m) => m.title)).toEqual(['First', 'Second', 'A', 'B']);
  });
});
