// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import { negotiateLocale, resolveUiLocale } from './negotiate';
import { normalizeSiteLocaleConfig, FALLBACK_SITE_LOCALES } from './siteLocales';

const both = { enabled: ['en', 'de'] as ('en' | 'de')[], defaultLocale: 'en' as const };
const englishOnly = { enabled: ['en'] as ('en' | 'de')[], defaultLocale: 'en' as const };

describe('negotiateLocale() — Accept-Language among the enabled languages', () => {
  it('takes the highest q-value that is enabled', () => {
    expect(negotiateLocale('fr-FR,fr;q=0.9,de;q=0.8,en;q=0.7', ['en', 'de'])).toBe('de');
    expect(negotiateLocale('en;q=0.4,de;q=0.6', ['en', 'de'])).toBe('de');
  });

  it('keeps the header order on equal q-values', () => {
    expect(negotiateLocale('en,de', ['en', 'de'])).toBe('en');
    expect(negotiateLocale('de,en', ['en', 'de'])).toBe('de');
  });

  it('matches a regional tag by its primary subtag, case-insensitively', () => {
    expect(negotiateLocale('de-AT', ['en', 'de'])).toBe('de');
    expect(negotiateLocale('EN-gb', ['en', 'de'])).toBe('en');
  });

  it('never picks a language that is not enabled', () => {
    expect(negotiateLocale('de-DE,de;q=0.9', ['en'])).toBeNull();
    expect(negotiateLocale('de,en;q=0.5', ['en'])).toBe('en');
  });

  it('skips q=0 and the wildcard, and survives junk', () => {
    expect(negotiateLocale('de;q=0,en;q=0.1', ['en', 'de'])).toBe('en');
    expect(negotiateLocale('*', ['en', 'de'])).toBeNull();
    expect(negotiateLocale(';;,,', ['en', 'de'])).toBeNull();
    expect(negotiateLocale('', ['en', 'de'])).toBeNull();
    expect(negotiateLocale(null, ['en', 'de'])).toBeNull();
  });
});

describe('resolveUiLocale() — profile → cookie → negotiation → site default', () => {
  it('the account preference wins over everything', () => {
    expect(resolveUiLocale({ profile: 'de', cookie: 'en', acceptLanguage: 'en' }, both)).toBe('de');
  });

  it('the explicit cookie wins over the browser', () => {
    expect(resolveUiLocale({ cookie: 'en', acceptLanguage: 'de-DE' }, both)).toBe('en');
  });

  it('negotiates only when there is no explicit choice', () => {
    expect(resolveUiLocale({ acceptLanguage: 'de-DE,de;q=0.9' }, both)).toBe('de');
  });

  it('falls back to the site default', () => {
    expect(resolveUiLocale({ acceptLanguage: 'fr-FR' }, both)).toBe('en');
    expect(resolveUiLocale({}, { enabled: ['en', 'de'], defaultLocale: 'de' })).toBe('de');
  });

  it('ignores a choice whose language is no longer enabled', () => {
    expect(resolveUiLocale({ profile: 'de', cookie: 'de', acceptLanguage: 'de' }, englishOnly)).toBe('en');
    expect(resolveUiLocale({ profile: 'fr', cookie: 'xx' }, both)).toBe('en');
  });
});

describe('normalizeSiteLocaleConfig()', () => {
  it('keeps catalog order and drops unknown codes', () => {
    expect(normalizeSiteLocaleConfig({ enabled: ['de', 'fr', 'en'], defaultLocale: 'de' })).toEqual({ enabled: ['en', 'de'], defaultLocale: 'de' });
  });

  it('never leaves the set empty', () => {
    expect(normalizeSiteLocaleConfig({ enabled: [] })).toEqual(FALLBACK_SITE_LOCALES);
    expect(normalizeSiteLocaleConfig({ enabled: 'en' })).toEqual(FALLBACK_SITE_LOCALES);
    expect(normalizeSiteLocaleConfig({})).toEqual(FALLBACK_SITE_LOCALES);
  });

  it('keeps the default among the enabled', () => {
    expect(normalizeSiteLocaleConfig({ enabled: ['de'], defaultLocale: 'en' })).toEqual({ enabled: ['de'], defaultLocale: 'de' });
    expect(normalizeSiteLocaleConfig({ enabled: ['en', 'de'], defaultLocale: 'xx' })).toEqual({ enabled: ['en', 'de'], defaultLocale: 'en' });
  });
});
