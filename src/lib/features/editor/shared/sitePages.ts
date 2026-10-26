// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The app's own linkable pages, which are not nodes, so no node picker finds
// them. A quick link to one stores its path, so a filter can follow
// (docs/architecture/blocks/node-embeds.md#quick-link-targets). A new linkable route is one entry.
import * as m from '$lib/paraglide/messages';
import { isLocale } from '$lib/paraglide/runtime';
import { searchHref } from '$lib/features/search';

export interface SitePage {
  path: string;
  /** In the interface language unless a locale is given: a card's label is
   * content, so it takes the page's content language where a catalogue has it. */
  label: (locale?: string) => string;
}

// A content language the catalogues have, or none (the interface's).
const asLocale = (locale?: string) => (locale && isLocale(locale) ? locale : undefined);

export const SITE_PAGES: readonly SitePage[] = [
  { path: searchHref({}), label: (locale) => m.search_page_title({}, { locale: asLocale(locale) }) },
];

/** Every site page for an empty query, else those whose name or path contains it. */
export function matchSitePages(query: string, pages: readonly SitePage[] = SITE_PAGES): SitePage[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...pages];
  return pages.filter((p) => p.label().toLowerCase().includes(q) || p.path.toLowerCase().includes(q));
}
