// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, it } from 'vitest';
import { NODE_SEARCH_LIMIT, NODE_SEARCH_MAX_EXCLUDE, NODE_SEARCH_MAX_LIMIT, NODE_SEARCH_MAX_OFFSET, parseNodeSearchParams } from './nodeSearchParams';

const parse = (query: string) => parseNodeSearchParams(new URLSearchParams(query));
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('parseNodeSearchParams', () => {
  it('is null without types: the legacy link search', () => {
    expect(parse('q=a')).toBeNull();
  });

  it('reads the term trimmed and the known types in their own order', () => {
    expect(parse('q=%20roadmap%20&types=collection,%20page,widget')).toEqual({
      q: 'roadmap',
      types: ['page', 'collection'],
      limit: NODE_SEARCH_LIMIT,
      offset: 0,
      exclude: [],
      recent: false,
    });
  });

  it('asks for the viewer\'s recent nodes only with recent=1', () => {
    expect(parse('types=page&recent=1')?.recent).toBe(true);
    expect(parse('types=page&recent=yes')?.recent).toBe(false);
  });

  it('asks for no type at all when none is known', () => {
    expect(parse('types=')?.types).toEqual([]);
    expect(parse('types=widget')?.types).toEqual([]);
  });

  it('clamps the page size and the offset, and ignores what is no whole number', () => {
    expect(parse('types=page&limit=0')?.limit).toBe(1);
    expect(parse('types=page&limit=500')?.limit).toBe(NODE_SEARCH_MAX_LIMIT);
    expect(parse('types=page&limit=2.5')?.limit).toBe(NODE_SEARCH_LIMIT);
    expect(parse('types=page&limit=')?.limit).toBe(NODE_SEARCH_LIMIT);
    expect(parse('types=page&offset=-4')?.offset).toBe(0);
    expect(parse('types=page&offset=24')?.offset).toBe(24);
    expect(parse('types=page&offset=99999')?.offset).toBe(NODE_SEARCH_MAX_OFFSET);
    expect(parse('types=page&offset=x')?.offset).toBe(0);
  });

  it('leaves out only well-formed ids, each once, and no more than its cap', () => {
    expect(parse(`types=page&exclude=${id(1)},nope,${id(1)},%20${id(2)}`)?.exclude).toEqual([id(1), id(2)]);
    const many = Array.from({ length: NODE_SEARCH_MAX_EXCLUDE + 5 }, (_, i) => id(i)).join(',');
    expect(parse(`types=page&exclude=${many}`)?.exclude).toHaveLength(NODE_SEARCH_MAX_EXCLUDE);
  });
});
