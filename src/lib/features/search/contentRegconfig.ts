// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The text-search configuration per content language (docs/architecture/languages.md). The
// generated search_tsv columns hold the same map as a CASE, which
// contentRegconfig.test.ts keeps in step. A language without one is 'simple'.
import type { Locale } from '$lib/paraglide/runtime';
import { SUPPORTED_LOCALES } from '$lib/platform/i18n/siteLocales';

export const CONTENT_REGCONFIG: Record<Locale, string> = {
  de: 'german',
  en: 'english',
};

export const FALLBACK_REGCONFIG = 'simple';

export function regconfigFor(locale: string): string {
  return (CONTENT_REGCONFIG as Record<string, string>)[locale] ?? FALLBACK_REGCONFIG;
}

/** One per supported language, not just the enabled ones: a disabled
 * language's content stays findable. */
export function searchRegconfigs(): string[] {
  return [...new Set(SUPPORTED_LOCALES.map(regconfigFor))];
}

/** The generated columns' CASE, for a per-row ts_headline. Built from this
 * module's constants and the caller's column literal, never from input. */
export function regconfigCaseSql(column: string): string {
  const whens = Object.entries(CONTENT_REGCONFIG)
    .map(([locale, config]) => `when '${locale}' then '${config}'::regconfig`)
    .join(' ');
  return `case ${column} ${whens} else '${FALLBACK_REGCONFIG}'::regconfig end`;
}
