// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The resolved URL state in the query model's shape: a wire filter, as a query
// block stores it, plus the sort, the term and the page's window.
import type { WireNodeFilter, WireOrderByInput } from '$lib/features/query';
import { SEARCH_PAGE_SIZE, effectiveSort, type SearchParams, type SearchSort } from './searchUrl';

/** Null when the parameter is absent or was dropped. */
export interface SearchIds {
  classId: string | null;
  namespaceId: string | null;
}

export interface SearchListQuery {
  filter: WireNodeFilter | null;
  orderBy: WireOrderByInput | 'relevance' | null;
  text: string | null;
  first: number;
  offset: number;
}

const SORT_FIELD: Record<Exclude<SearchSort, 'relevance'>, { name: string; direction: 'ASC' | 'DESC' }> = {
  updated: { name: 'updatedAt', direction: 'DESC' },
  created: { name: 'createdAt', direction: 'DESC' },
  title: { name: 'title', direction: 'ASC' },
};

/** Never an empty `and` group, which the filter's shape check refuses. */
export function toListQuery(applied: SearchParams, ids: SearchIds): SearchListQuery {
  const conditions: WireNodeFilter[] = [];
  if (ids.classId) {
    // EXACT is written only when set, like a stored query block's.
    conditions.push({ intrinsic: { field: 'CLASS_ID', operator: 'EQ', value: ids.classId, ...(applied.exact ? { classMatch: 'EXACT' as const } : {}) } });
  }
  if (applied.tags.length) conditions.push({ tag: { operator: 'HAS_ANY', values: applied.tags } });
  if (applied.type) conditions.push({ intrinsic: { field: 'TYPE', operator: 'EQ', value: applied.type } });
  if (ids.namespaceId) conditions.push({ intrinsic: { field: 'NAMESPACE_ID', operator: 'EQ', value: ids.namespaceId } });
  const filter = conditions.length === 0 ? null : conditions.length === 1 ? conditions[0] : { and: conditions };

  const sort = effectiveSort(applied);
  const orderBy: SearchListQuery['orderBy'] = sort === 'relevance' ? 'relevance' : { kind: 'INTRINSIC', ...SORT_FIELD[sort] };
  return { filter, orderBy, text: applied.q || null, first: SEARCH_PAGE_SIZE, offset: (applied.page - 1) * SEARCH_PAGE_SIZE };
}
