// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// A schema name's text, one string per locale (docs/architecture/languages.md). Identity never
// localizes, and presentation reads it only through localize(). It may hold any
// supported language, so a translation survives its language being disabled;
// write-side validation is localizedText.server.ts.
import { getLocale, type Locale } from '$lib/paraglide/runtime';
import { SUPPORTED_LOCALES, enabledLocales, siteDefaultLocale } from './siteLocales';

/** One string per locale; an absent key is the only way to say "not translated". */
export type LocalizedText = Partial<Record<Locale, string>>;

/** The common fallback, tried right after the requested locale. */
export const COMMON_FALLBACK_LOCALE: Locale = 'en';

// A blank translation counts as absent, so a stray '' never wins the chain.
function textIn(text: LocalizedText, locale: string): string | null {
  const value = (text as Record<string, unknown>)[locale];
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

/**
 * By the chain `locale`, `en`, the site default, any translation (in a fixed
 * order), then `fallback`: the identifier for a label, '' for a description.
 */
export function localize(text: LocalizedText | null | undefined, fallback: string, locale: Locale = getLocale()): string {
  if (text) {
    for (const candidate of [locale, COMMON_FALLBACK_LOCALE, siteDefaultLocale(), ...SUPPORTED_LOCALES]) {
      const value = textIn(text, candidate);
      if (value !== null) return value;
    }
    for (const key of Object.keys(text).sort()) {
      const value = textIn(text, key);
      if (value !== null) return value;
    }
  }
  return fallback;
}

/** localize() once per key, for rows that repeat a few entities. `key` is also the fallback. */
export function labelCache(locale: Locale = getLocale()): (key: string, text: LocalizedText | null | undefined) => string {
  const cache = new Map<string, string>();
  return (key, text) => {
    let label = cache.get(key);
    if (label === undefined) {
      label = localize(text, key, locale);
      cache.set(key, label);
    }
    return label;
  };
}

export function hasText(text: LocalizedText | null | undefined): boolean {
  return !!text && Object.keys(text).some((key) => textIn(text, key) !== null);
}

/** The enabled languages `text` lacks; an empty optional field has no gaps. */
export function missingLocales(text: LocalizedText | null | undefined, { optional = false }: { optional?: boolean } = {}): Locale[] {
  if (optional && !hasText(text)) return [];
  return enabledLocales().filter((locale) => !text || textIn(text, locale) === null);
}

/** Case-insensitive, against every locale's text. */
export function localizedTextMatches(text: LocalizedText | null | undefined, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  if (!text) return false;
  return Object.keys(text).some((key) => textIn(text, key)?.toLowerCase().includes(needle));
}

const collators = new Map<string, Intl.Collator>();

/** Orders two resolved labels the way the viewer's locale sorts text. */
export function compareLabels(a: string, b: string, locale: Locale = getLocale()): number {
  let collator = collators.get(locale);
  if (!collator) {
    collator = new Intl.Collator(locale, { sensitivity: 'base' });
    collators.set(locale, collator);
  }
  return collator.compare(a, b);
}
