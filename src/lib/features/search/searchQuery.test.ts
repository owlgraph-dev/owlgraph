// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, it } from 'vitest';
import { fromWireFilter, fromWireOrderBy, validateFilterOperators, validateFilterShape } from '$lib/features/query';
import { toListQuery } from './searchQuery';
import { EMPTY_SEARCH, SEARCH_PAGE_SIZE, type SearchParams } from './searchUrl';

const CLASS = '11111111-1111-4111-8111-111111111111';
const NAMESPACE = '22222222-2222-4222-8222-222222222222';
const state = (p: Partial<SearchParams>): SearchParams => ({ ...EMPTY_SEARCH, ...p });
const noIds = { classId: null, namespaceId: null };

describe('toListQuery', () => {
  it('lists everything, newest first, without parameters', () => {
    expect(toListQuery(EMPTY_SEARCH, noIds)).toEqual({
      filter: null,
      orderBy: { kind: 'INTRINSIC', name: 'updatedAt', direction: 'DESC' },
      text: null,
      first: SEARCH_PAGE_SIZE,
      offset: 0,
    });
  });

  it('makes one condition a bare leaf, never an and-group of one', () => {
    expect(toListQuery(state({ tags: ['ai', 'ml'] }), noIds).filter).toEqual({ tag: { operator: 'HAS_ANY', values: ['ai', 'ml'] } });
  });

  it('selects a class polymorphically, exactly only when asked', () => {
    expect(toListQuery(state({ class: 'concept' }), { classId: CLASS, namespaceId: null }).filter).toEqual({
      intrinsic: { field: 'CLASS_ID', operator: 'EQ', value: CLASS },
    });
    expect(toListQuery(state({ class: 'concept', exact: true }), { classId: CLASS, namespaceId: null }).filter).toEqual({
      intrinsic: { field: 'CLASS_ID', operator: 'EQ', value: CLASS, classMatch: 'EXACT' },
    });
  });

  it('leaves out a class or namespace the server dropped', () => {
    expect(toListQuery(state({ class: 'gone', namespace: 'hidden' }), noIds).filter).toBeNull();
  });

  it('AND-s every condition', () => {
    const q = toListQuery(state({ class: 'concept', tags: ['ai'], type: 'page', namespace: 'wiki' }), { classId: CLASS, namespaceId: NAMESPACE });
    expect(q.filter).toEqual({
      and: [
        { intrinsic: { field: 'CLASS_ID', operator: 'EQ', value: CLASS } },
        { tag: { operator: 'HAS_ANY', values: ['ai'] } },
        { intrinsic: { field: 'TYPE', operator: 'EQ', value: 'page' } },
        { intrinsic: { field: 'NAMESPACE_ID', operator: 'EQ', value: NAMESPACE } },
      ],
    });
  });

  it('sorts by relevance with a term, and by the chosen field otherwise', () => {
    expect(toListQuery(state({ q: 'graph' }), noIds)).toMatchObject({ orderBy: 'relevance', text: 'graph' });
    expect(toListQuery(state({ q: 'graph', sort: 'title' }), noIds).orderBy).toEqual({ kind: 'INTRINSIC', name: 'title', direction: 'ASC' });
    expect(toListQuery(state({ sort: 'created' }), noIds).orderBy).toEqual({ kind: 'INTRINSIC', name: 'createdAt', direction: 'DESC' });
    expect(toListQuery(state({ sort: 'relevance' }), noIds).orderBy).toEqual({ kind: 'INTRINSIC', name: 'updatedAt', direction: 'DESC' });
  });

  it('turns the page into an offset', () => {
    expect(toListQuery(state({ page: 3 }), noIds).offset).toBe(2 * SEARCH_PAGE_SIZE);
  });

  it('only ever builds a filter and sort the query model accepts', () => {
    const shapes: SearchParams[] = [
      state({ tags: ['a'] }),
      state({ class: 'c', exact: true }),
      state({ class: 'c', tags: ['a', 'b'], type: 'document', namespace: 'n', sort: 'title' }),
      state({ type: 'page', sort: 'created' }),
    ];
    for (const s of shapes) {
      const q = toListQuery(s, { classId: CLASS, namespaceId: NAMESPACE });
      if (q.filter) {
        const filter = fromWireFilter(q.filter);
        expect(() => validateFilterShape(filter)).not.toThrow();
        expect(() => validateFilterOperators(filter, new Map())).not.toThrow();
      }
      if (q.orderBy && q.orderBy !== 'relevance') expect(() => fromWireOrderBy(q.orderBy as Exclude<typeof q.orderBy, 'relevance'>)).not.toThrow();
    }
  });
});
