// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The interface language (docs/architecture/languages.md), first match wins: the account's
// preference, the picker's cookie, Accept-Language among the enabled languages,
// the site default. A choice counts only while its language is enabled, and
// negotiation never overrides one.
import type { Locale } from '$lib/paraglide/runtime';
import type { SiteLocaleConfig } from './siteLocales';

/** The cookie the language picker writes — and nothing else does. */
export const UI_LOCALE_COOKIE = 'ui_locale';

/**
 * The best enabled language, or null. By q-value, ties in header order; each
 * range tries its full tag, then its primary subtag ("de-AT" → "de").
 */
export function negotiateLocale(header: string | null | undefined, enabled: readonly Locale[]): Locale | null {
  if (!header) return null;
  const ranges = header
    .split(',')
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(';');
      const qParam = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
      const q = qParam ? Number(qParam.slice(2)) : 1;
      return { tag: tag.trim().toLowerCase(), q: Number.isFinite(q) ? q : 0, index };
    })
    .filter((r) => r.tag && r.tag !== '*' && r.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index);
  const byLower = new Map(enabled.map((l) => [l.toLowerCase(), l]));
  for (const r of ranges) {
    const exact = byLower.get(r.tag);
    if (exact) return exact;
    const primary = byLower.get(r.tag.split('-')[0]);
    if (primary) return primary;
  }
  return null;
}

function enabledOrNull(value: string | null | undefined, enabled: readonly Locale[]): Locale | null {
  return value && (enabled as readonly string[]).includes(value) ? (value as Locale) : null;
}

/** The interface language for one request, by the order above. */
export function resolveUiLocale(
  viewer: { profile?: string | null; cookie?: string | null; acceptLanguage?: string | null },
  config: SiteLocaleConfig
): Locale {
  return (
    enabledOrNull(viewer.profile, config.enabled) ??
    enabledOrNull(viewer.cookie, config.enabled) ??
    negotiateLocale(viewer.acceptLanguage, config.enabled) ??
    config.defaultLocale
  );
}
