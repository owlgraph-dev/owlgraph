// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, it } from 'vitest';
import { DEFAULT_NAMESPACE_PARAM, EMPTY_SEARCH, SEARCH_MAX_TAGS, effectiveSort, parseSearchParams, searchHref } from './searchUrl';

const parse = (query: string) => parseSearchParams(new URLSearchParams(query));

describe('parseSearchParams', () => {
  it('reads every parameter of the contract', () => {
    expect(parse('q=graph&class=concept&exact=1&tag=ai&tag=ml&type=document&namespace=wiki&sort=title&view=grid&page=3')).toEqual({
      q: 'graph',
      class: 'concept',
      exact: true,
      tags: ['ai', 'ml'],
      type: 'document',
      namespace: 'wiki',
      sort: 'title',
      view: 'grid',
      page: 3,
    });
  });

  it('is the empty state without parameters, and ignores unknown ones', () => {
    expect(parse('')).toEqual(EMPTY_SEARCH);
    expect(parse('foo=bar&utm_source=x')).toEqual(EMPTY_SEARCH);
  });

  it('falls back silently on invalid values', () => {
    expect(parse('type=folder&sort=random&view=table&page=-3&namespace=Not%20A%20Slug&class=a%20b')).toEqual(EMPTY_SEARCH);
    expect(parse('page=0').page).toBe(1);
    expect(parse('page=2.5').page).toBe(1);
    expect(parse('page=501').page).toBe(1);
    expect(parse('page=500').page).toBe(500);
  });

  it('only reads exact with a class', () => {
    expect(parse('exact=1').exact).toBe(false);
    expect(parse('class=concept&exact=yes').exact).toBe(false);
  });

  it('cleans tags: trims, collapses spaces, de-duplicates case-insensitively, caps', () => {
    expect(parse('tag=%20AI%20&tag=ai&tag=machine%20%20learning&tag=').tags).toEqual(['AI', 'machine learning']);
    expect(parse(`tag=${'x'.repeat(65)}`).tags).toEqual([]);
    const many = Array.from({ length: 15 }, (_, i) => `tag=t${i}`).join('&');
    expect(parse(many).tags).toHaveLength(SEARCH_MAX_TAGS);
  });

  it('accepts the default namespace token', () => {
    expect(parse(`namespace=${DEFAULT_NAMESPACE_PARAM}`).namespace).toBe(DEFAULT_NAMESPACE_PARAM);
  });

  it('drops a sort that is the default anyway, and relevance without a term', () => {
    expect(parse('q=x&sort=relevance').sort).toBeNull();
    expect(parse('sort=updated').sort).toBeNull();
    expect(parse('sort=relevance').sort).toBeNull();
    expect(parse('q=x&sort=updated').sort).toBe('updated');
  });

  it('trims and caps the term', () => {
    expect(parse('q=%20%20a%20%20b%20').q).toBe('a b');
    expect(parse(`q=${'y'.repeat(300)}`).q).toHaveLength(200);
  });
});

describe('effectiveSort', () => {
  it('is relevance with a term and updated without one', () => {
    expect(effectiveSort({ q: 'x', sort: null })).toBe('relevance');
    expect(effectiveSort({ q: '', sort: null })).toBe('updated');
    expect(effectiveSort({ q: '', sort: 'relevance' })).toBe('updated');
    expect(effectiveSort({ q: '', sort: 'title' })).toBe('title');
  });
});

describe('searchHref', () => {
  it('writes only what differs from the default, in a fixed order', () => {
    expect(searchHref({})).toBe('/search');
    expect(searchHref({ page: 1, view: 'list', sort: 'updated' })).toBe('/search');
    expect(searchHref({ view: 'grid', tags: ['b', 'a'], q: 'graph', page: 2, class: 'concept', exact: true })).toBe(
      '/search?q=graph&class=concept&exact=1&tag=b&tag=a&view=grid&page=2'
    );
  });

  it('drops exact without a class, and a default sort', () => {
    expect(searchHref({ exact: true })).toBe('/search');
    expect(searchHref({ q: 'x', sort: 'relevance' })).toBe('/search?q=x');
    expect(searchHref({ q: 'x', sort: 'title' })).toBe('/search?q=x&sort=title');
  });

  it('round-trips through parseSearchParams', () => {
    const state = { ...EMPTY_SEARCH, q: 'knowledge graph', class: 'concept', tags: ['ai'], type: 'page' as const, namespace: DEFAULT_NAMESPACE_PARAM, sort: 'created' as const, view: 'grid' as const, page: 4 };
    const href = searchHref(state);
    expect(parseSearchParams(new URL(href, 'http://x').searchParams)).toEqual(state);
  });
});
