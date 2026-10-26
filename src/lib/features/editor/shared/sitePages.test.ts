// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, it } from 'vitest';
import { SITE_PAGES, matchSitePages, type SitePage } from './sitePages';

const pages: SitePage[] = [
  { path: '/search', label: () => 'Search' },
  { path: '/graph', label: () => 'Graph' },
];

describe('matchSitePages', () => {
  it('lists every site page for an empty query', () => {
    expect(matchSitePages('', pages)).toEqual(pages);
    expect(matchSitePages('   ', pages)).toEqual(pages);
  });

  it('matches by name and by path, case-insensitively', () => {
    expect(matchSitePages('sea', pages).map((p) => p.path)).toEqual(['/search']);
    expect(matchSitePages('GRA', pages).map((p) => p.path)).toEqual(['/graph']);
    expect(matchSitePages('/gr', pages).map((p) => p.path)).toEqual(['/graph']);
  });

  it('finds nothing for a miss', () => {
    expect(matchSitePages('settings', pages)).toEqual([]);
  });

  it('offers the search page, named in the language asked for', () => {
    const search = SITE_PAGES.find((p) => p.path === '/search');
    expect(search?.label('en')).toBe('Search');
    expect(search?.label('de')).toBe('Suche');
  });
});
