// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// One rule for the four schema catalogues (docs/architecture/languages.md): the search matches an
// identifier or any language of a name; the missing-translations filter keeps
// rows with a gap.
import { localizedTextMatches, missingLocales, type LocalizedText } from '$lib/platform/i18n/localizedText';
import { enabledLocales } from '$lib/platform/i18n/siteLocales';
import type { Locale } from '$lib/paraglide/runtime';

/** One localized name of a row; `optional` for a description or an inverse
 * label, which is only a gap once it has text somewhere. */
export interface CatalogText {
  text: LocalizedText | null | undefined;
  optional?: boolean;
}

/** The languages any of the row's names lacks, in configured order. */
export function rowMissingLocales(texts: readonly CatalogText[]): Locale[] {
  const missing = new Set(texts.flatMap((t) => missingLocales(t.text, { optional: t.optional })));
  return enabledLocales().filter((locale) => missing.has(locale));
}

/** A case-insensitive substring of an identifier or of any language of a name. */
export function rowMatches(query: string, identifiers: readonly string[], texts: readonly CatalogText[]): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return identifiers.some((id) => id.toLowerCase().includes(needle)) || texts.some((t) => localizedTextMatches(t.text, needle));
}
