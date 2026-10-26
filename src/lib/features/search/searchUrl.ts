// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { NODE_TYPES, type NodeType } from '$lib/features/nodes';

// The one translation between the address bar and the page's state
// (docs/architecture/search.md). Syntax only: what a value names, and whether the viewer may
// use it, is searchQuery.server.ts's. An invalid value silently falls back to
// its default, so a stale link still lists something. Values are slugs, never labels.
//   /search?q=&class=&exact=1&tag=&tag=&type=&namespace=&sort=&view=&page=

export type SearchSort = 'relevance' | 'updated' | 'created' | 'title';
export type SearchView = 'list' | 'grid';

export interface SearchParams {
  /** The full-text term; '' for none. */
  q: string;
  /** The class and its subclasses, or the class alone with `exact`. */
  class: string | null;
  exact: boolean;
  /** Any of these tags (case-insensitive). */
  tags: string[];
  type: NodeType | null;
  /** DEFAULT_NAMESPACE_PARAM for the default namespace, which has no slug. */
  namespace: string | null;
  /** null: relevance with a term, most recently updated without one. */
  sort: SearchSort | null;
  view: SearchView;
  /** 1-based. */
  page: number;
}

export const SEARCH_PAGE_SIZE = 24;
const SEARCH_MAX_PAGE = 500;
export const SEARCH_MAX_TAGS = 10;
const MAX_Q = 200;
const MAX_TAG = 64;

/** Namespace slugs are [a-z0-9-], so the underscore never names a real one. */
export const DEFAULT_NAMESPACE_PARAM = '_default';

const SORTS: readonly SearchSort[] = ['relevance', 'updated', 'created', 'title'];
const CLASS_SLUG_RE = /^[\w-]{1,100}$/; // the class key's form (properties.server.ts NAME_RE)
const NAMESPACE_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const EMPTY_SEARCH: SearchParams = { q: '', class: null, exact: false, tags: [], type: null, namespace: null, sort: null, view: 'list', page: 1 };

/** Relevance needs a term; without one, the default is most recently updated. */
export function effectiveSort(params: Pick<SearchParams, 'q' | 'sort'>): SearchSort {
  const sort = params.sort ?? (params.q ? 'relevance' : 'updated');
  return sort === 'relevance' && !params.q ? 'updated' : sort;
}

function oneOf<T extends string>(value: string | null, allowed: readonly T[]): T | null {
  return value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

/** Tags as the query compares them: deduplicated case-insensitively, the first
 * spelling kept. */
function cleanSearchTags(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const tag = raw.trim().replace(/\s+/g, ' ');
    if (!tag || tag.length > MAX_TAG || seen.has(tag.toLowerCase())) continue;
    seen.add(tag.toLowerCase());
    out.push(tag);
    if (out.length === SEARCH_MAX_TAGS) break;
  }
  return out;
}

export function parseSearchParams(sp: URLSearchParams): SearchParams {
  const q = (sp.get('q') ?? '').trim().replace(/\s+/g, ' ').slice(0, MAX_Q);
  const classSlug = sp.get('class')?.trim() ?? '';
  const cls = CLASS_SLUG_RE.test(classSlug) ? classSlug : null;
  const namespace = sp.get('namespace')?.trim() ?? '';
  const pageRaw = sp.get('page') ?? '';
  const page = /^\d{1,4}$/.test(pageRaw) ? Number(pageRaw) : 1;
  const params: SearchParams = {
    q,
    class: cls,
    exact: cls !== null && sp.get('exact') === '1',
    tags: cleanSearchTags(sp.getAll('tag')),
    type: oneOf(sp.get('type'), NODE_TYPES),
    namespace: namespace === DEFAULT_NAMESPACE_PARAM || NAMESPACE_SLUG_RE.test(namespace) ? namespace : null,
    sort: oneOf(sp.get('sort'), SORTS),
    view: sp.get('view') === 'grid' ? 'grid' : 'list',
    page: page >= 1 && page <= SEARCH_MAX_PAGE ? page : 1,
  };
  // A sort that is the default anyway is dropped, so a term added later still
  // sorts by relevance.
  if (params.sort && params.sort === effectiveSort({ q: params.q, sort: null })) params.sort = null;
  if (params.sort === 'relevance' && !params.q) params.sort = null;
  return params;
}

/** The canonical URL: only what differs from the default, in a fixed order, so
 * one state has one URL. */
export function searchHref(params: Partial<SearchParams>): string {
  const p = { ...EMPTY_SEARCH, ...params };
  const sp = new URLSearchParams();
  const q = p.q.trim();
  if (q) sp.set('q', q);
  if (p.class) {
    sp.set('class', p.class);
    if (p.exact) sp.set('exact', '1');
  }
  for (const tag of cleanSearchTags(p.tags)) sp.append('tag', tag);
  if (p.type) sp.set('type', p.type);
  if (p.namespace) sp.set('namespace', p.namespace);
  if (p.sort && effectiveSort({ q, sort: p.sort }) !== effectiveSort({ q, sort: null })) sp.set('sort', effectiveSort({ q, sort: p.sort }));
  if (p.view === 'grid') sp.set('view', 'grid');
  if (p.page > 1) sp.set('page', String(p.page));
  const query = sp.toString();
  return query ? `/search?${query}` : '/search';
}
