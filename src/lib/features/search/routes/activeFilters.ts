// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The phone's filter chips: never the term, the sort or the view, which have
// controls of their own. Their number is the Filter button's count.
import * as m from '$lib/paraglide/messages';
import { typeItems } from '$lib/features/query';
import type { SearchParams } from '$lib/features/search';

export interface ActiveFilter {
  key: string;
  label: string;
  /** The change that drops this filter alone. */
  remove: Partial<SearchParams>;
}

export function activeFilters(
  applied: Pick<SearchParams, 'class' | 'exact' | 'tags' | 'type' | 'namespace'>,
  labels: { classLabel: string | null; namespaceName: string | null }
): ActiveFilter[] {
  const out: ActiveFilter[] = [];
  if (applied.class) {
    const name = labels.classLabel ?? applied.class;
    out.push({ key: 'class', label: applied.exact ? name : m.search_page_chip_subclasses({ name }), remove: { class: null, exact: false } });
  }
  for (const tag of applied.tags) {
    out.push({ key: `tag:${tag.toLowerCase()}`, label: tag, remove: { tags: applied.tags.filter((t) => t !== tag) } });
  }
  if (applied.type) {
    const label = typeItems().find((t) => t.value === applied.type)?.label ?? applied.type;
    out.push({ key: 'type', label, remove: { type: null } });
  }
  if (applied.namespace) {
    out.push({ key: 'namespace', label: labels.namespaceName ?? applied.namespace, remove: { namespace: null } });
  }
  return out;
}
