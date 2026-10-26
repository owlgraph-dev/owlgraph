// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The site's languages (docs/architecture/languages.md): supported (the compiled catalogues, what a
// LocalizedText may hold), enabled (the admin's subset under Languages) and the
// site default (one of the enabled). The server and the browser both set it
// here, so readers need not thread it; until then it is every catalog.
import { baseLocale, locales, type Locale } from '$lib/paraglide/runtime';

export const SUPPORTED_LOCALES: readonly Locale[] = locales;

export interface SiteLocaleConfig {
  /** The enabled languages, in catalogue order; never empty. */
  enabled: Locale[];
  /** The site default language; always one of `enabled`. */
  defaultLocale: Locale;
}

export const FALLBACK_SITE_LOCALES: SiteLocaleConfig = { enabled: [...locales], defaultLocale: baseLocale };

export function isSupportedLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/** Unknown codes dropped, catalogue order kept, never empty, the default always enabled. */
export function normalizeSiteLocaleConfig(raw: { enabled?: unknown; defaultLocale?: unknown }): SiteLocaleConfig {
  const given = Array.isArray(raw.enabled) ? raw.enabled : [];
  let enabled = SUPPORTED_LOCALES.filter((l) => given.includes(l));
  if (enabled.length === 0) enabled = [...SUPPORTED_LOCALES];
  const defaultLocale = isSupportedLocale(raw.defaultLocale) && enabled.includes(raw.defaultLocale)
    ? raw.defaultLocale
    : enabled.includes(FALLBACK_SITE_LOCALES.defaultLocale)
      ? FALLBACK_SITE_LOCALES.defaultLocale
      : enabled[0];
  return { enabled, defaultLocale };
}

let current: SiteLocaleConfig = FALLBACK_SITE_LOCALES;

export function setSiteLocaleConfig(config: SiteLocaleConfig): void {
  current = normalizeSiteLocaleConfig(config);
}

export function siteLocaleConfig(): SiteLocaleConfig {
  return current;
}

/** In catalogue order. */
export function enabledLocales(): readonly Locale[] {
  return current.enabled;
}

export function siteDefaultLocale(): Locale {
  return current.defaultLocale;
}

export function isEnabledLocale(value: unknown): value is Locale {
  return isSupportedLocale(value) && current.enabled.includes(value);
}
