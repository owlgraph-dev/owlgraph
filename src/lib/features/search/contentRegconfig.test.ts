// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { CONTENT_REGCONFIG, FALLBACK_REGCONFIG, regconfigFor, searchRegconfigs } from './contentRegconfig';
import { SUPPORTED_LOCALES } from '$lib/platform/i18n/siteLocales';

describe('content language → text-search configuration', () => {
  it('covers every supported language', () => {
    for (const locale of SUPPORTED_LOCALES) expect(CONTENT_REGCONFIG[locale]).toBeTruthy();
  });

  it("falls back to 'simple' for a language without a configuration", () => {
    expect(regconfigFor('fr')).toBe(FALLBACK_REGCONFIG);
  });

  it('parses a query once per configuration a node can carry', () => {
    expect(searchRegconfigs().sort()).toEqual(['english', 'german']);
  });

  it('matches the CASE the generated search columns are built with', () => {
    // The newest migration that (re)builds search_tsv holds the map in SQL,
    // here the baseline in pg_dump's form; a language added here needs a
    // migration recreating those columns.
    const sql = readFileSync(new URL('../../../../migrations/0001_baseline.sql', import.meta.url), 'utf8');
    for (const [locale, config] of Object.entries(CONTENT_REGCONFIG)) {
      expect(sql).toContain(`WHEN '${locale}'::text THEN '${config}'::regconfig`);
    }
    expect(sql).toContain(`ELSE '${FALLBACK_REGCONFIG}'::regconfig`);
  });
});
