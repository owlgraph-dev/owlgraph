// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Shared by the filter row and the phone's filter sheet, so a filter reads the
// same in both. Every value is what the URL carries, never a label.
import * as m from '$lib/paraglide/messages';
import { classItems, typeItems, type PickerItem } from '$lib/features/query';
import type { NodeClassOption } from '$lib/features/semantic';
import type { SearchNamespaceOption, SearchSort } from '$lib/features/search';

/** A Select has no empty item: "no filter" is a value of its own. */
export const ALL = '__all__';

export function orNull<T extends string>(value: string): T | null {
  return value === ALL ? null : (value as T);
}

/** The query builder's indented class tree, keyed by slug. */
export function classPickerItems(options: readonly NodeClassOption[]): PickerItem[] {
  return [{ value: ALL, label: m.search_page_filter_class_all() }, ...classItems(options).map((item, i) => ({ ...item, value: options[i].slug }))];
}

export function matchItems(): PickerItem[] {
  return [
    { value: 'is-a', label: m.search_page_class_match_subclasses() },
    { value: 'exact', label: m.search_page_class_match_exact() },
  ];
}

export function typePickerItems(): PickerItem[] {
  return [{ value: ALL, label: m.search_page_filter_type_all() }, ...typeItems()];
}

export function namespacePickerItems(namespaces: readonly SearchNamespaceOption[]): PickerItem[] {
  return [{ value: ALL, label: m.search_page_filter_namespace_all() }, ...namespaces.map((n) => ({ value: n.value, label: n.name }))];
}

/** Relevance only with a term to be relevant to. */
export function sortItems(hasTerm: boolean): { value: SearchSort; label: string }[] {
  return [
    ...(hasTerm ? [{ value: 'relevance' as const, label: m.search_page_sort_relevance() }] : []),
    { value: 'updated', label: m.search_page_sort_updated() },
    { value: 'created', label: m.search_page_sort_created() },
    { value: 'title', label: m.search_page_sort_title() },
  ];
}
