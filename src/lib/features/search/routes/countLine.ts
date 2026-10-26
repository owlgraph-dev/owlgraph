// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// "24 pages for “graph” · class Concept (incl. subclasses) · tagged ai or ml".
// Built from what took effect, so a parameter the server dropped, such as a
// hidden namespace, is never mentioned.
import * as m from '$lib/paraglide/messages';
import { getLocale, type Locale } from '$lib/paraglide/runtime';
import type { SearchParams } from '$lib/features/search';

export interface CountLineInput {
  total: number;
  applied: Pick<SearchParams, 'q' | 'type' | 'exact' | 'tags'>;
  /** Null when none applies. */
  classLabel: string | null;
  namespaceName: string | null;
}

const NOUNS = {
  results: { one: m.search_page_count_results_one, other: m.search_page_count_results_other },
  page: { one: m.search_page_count_pages_one, other: m.search_page_count_pages_other },
  document: { one: m.search_page_count_documents_one, other: m.search_page_count_documents_other },
  collection: { one: m.search_page_count_collections_one, other: m.search_page_count_collections_other },
};

export function countLine({ total, applied, classLabel, namespaceName }: CountLineInput, locale: Locale = getLocale()): string {
  const noun = NOUNS[applied.type ?? 'results'];
  const plural = new Intl.PluralRules(locale).select(total) === 'one' ? noun.one : noun.other;
  const head = [plural({ count: total }, { locale })];
  if (applied.q) head.push(m.search_page_count_term({ q: applied.q }, { locale }));
  const parts = [head.join(' ')];
  if (classLabel) parts.push(applied.exact ? m.search_page_count_class_exact({ name: classLabel }, { locale }) : m.search_page_count_class({ name: classLabel }, { locale }));
  if (applied.tags.length) parts.push(m.search_page_count_tags({ tags: new Intl.ListFormat(locale, { type: 'disjunction' }).format(applied.tags) }, { locale }));
  if (namespaceName) parts.push(m.search_page_count_namespace({ name: namespaceName }, { locale }));
  return parts.join(' · ');
}
