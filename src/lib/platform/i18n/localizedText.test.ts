// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect, afterEach } from 'vitest';
import { overwriteGetLocale, baseLocale } from '$lib/paraglide/runtime';
import {
  localize,
  hasText,
  missingLocales,
  localizedTextMatches,
  compareLabels,
  COMMON_FALLBACK_LOCALE,
  type LocalizedText,
} from './localizedText';
import { FALLBACK_SITE_LOCALES, setSiteLocaleConfig, siteDefaultLocale } from './siteLocales';

afterEach(() => {
  overwriteGetLocale(() => baseLocale);
  setSiteLocaleConfig(FALLBACK_SITE_LOCALES);
});

describe('localize() — the fallback chain', () => {
  it('takes the requested locale first', () => {
    expect(localize({ de: 'Zusammenfassung', en: 'Abstract' }, 'documents:abstract', 'de')).toBe('Zusammenfassung');
    expect(localize({ de: 'Zusammenfassung', en: 'Abstract' }, 'documents:abstract', 'en')).toBe('Abstract');
  });

  it('falls back to en when the requested locale is missing', () => {
    expect(COMMON_FALLBACK_LOCALE).toBe('en');
    expect(localize({ en: 'Abstract' }, 'documents:abstract', 'de')).toBe('Abstract');
  });

  it('falls back to the site default after en', () => {
    // With English the default, 'Kern' comes from "any translation"; with
    // German the default, from the site-default step.
    expect(siteDefaultLocale()).toBe('en');
    expect(localize({ de: 'Kern' }, 'core', 'en')).toBe('Kern');
    setSiteLocaleConfig({ enabled: ['en', 'de'], defaultLocale: 'de' });
    expect(siteDefaultLocale()).toBe('de');
    expect(localize({ de: 'Kern' }, 'core', 'en')).toBe('Kern');
  });

  it('then takes any available translation, deterministically — configured locales first, then other keys alphabetically', () => {
    // A key outside the configured locales still resolves rather than vanish.
    const legacy = { fr: 'Résumé', it: 'Riassunto' } as unknown as LocalizedText;
    expect(localize(legacy, 'x', 'de')).toBe('Résumé');
    expect(localize({ de: 'Kern', ...({ fr: 'Noyau' } as object) } as LocalizedText, 'x', 'en')).toBe('Kern');
  });

  it('ends at the fallback — a label is never empty', () => {
    expect(localize({}, 'documents:abstract', 'de')).toBe('documents:abstract');
    expect(localize(null, 'core', 'de')).toBe('core');
    expect(localize(undefined, 'core', 'de')).toBe('core');
  });

  it('treats a blank translation as absent', () => {
    expect(localize({ de: '  ', en: 'Abstract' }, 'x', 'de')).toBe('Abstract');
    expect(localize({ de: '', en: '' }, 'x', 'de')).toBe('x');
  });

  it('resolves a description to an empty string when nothing is translated', () => {
    expect(localize({}, '', 'de')).toBe('');
  });

  it('defaults to the active locale', () => {
    overwriteGetLocale(() => 'de');
    expect(localize({ de: 'Seite', en: 'Page' }, 'page')).toBe('Seite');
    overwriteGetLocale(() => 'en');
    expect(localize({ de: 'Seite', en: 'Page' }, 'page')).toBe('Page');
  });
});

describe('missingLocales() — the gap indicator', () => {
  it('a label expects every configured locale', () => {
    expect(missingLocales({ en: 'Core' })).toEqual(['de']);
    expect(missingLocales({ de: 'Kern', en: 'Core' })).toEqual([]);
    expect(missingLocales({})).toEqual(['en', 'de']);
    expect(missingLocales({ de: ' ', en: 'Core' })).toEqual(['de']);
  });

  it('a disabled language is never a gap', () => {
    setSiteLocaleConfig({ enabled: ['en'], defaultLocale: 'en' });
    expect(missingLocales({ en: 'Core' })).toEqual([]);
    expect(missingLocales({ de: 'Kern' })).toEqual(['en']);
  });

  it('an optional field is only a gap once it has text somewhere', () => {
    expect(missingLocales({}, { optional: true })).toEqual([]);
    expect(missingLocales(null, { optional: true })).toEqual([]);
    expect(missingLocales({ en: 'is authored by' }, { optional: true })).toEqual(['de']);
  });
});

describe('hasText()', () => {
  it('is true when any locale carries non-blank text', () => {
    expect(hasText({ de: 'x' })).toBe(true);
    expect(hasText({ de: ' ' })).toBe(false);
    expect(hasText({})).toBe(false);
    expect(hasText(null)).toBe(false);
  });
});

describe('localizedTextMatches() — search across every locale', () => {
  it('matches any locale, case-insensitively', () => {
    const label = { de: 'Dokumente', en: 'Documents' };
    expect(localizedTextMatches(label, 'dokum')).toBe(true);
    expect(localizedTextMatches(label, 'DOCUMENTS')).toBe(true);
    expect(localizedTextMatches(label, 'kern')).toBe(false);
  });

  it('an empty query matches everything; empty text matches no query', () => {
    expect(localizedTextMatches({}, '  ')).toBe(true);
    expect(localizedTextMatches(null, 'x')).toBe(false);
  });
});

describe('compareLabels()', () => {
  it('sorts by the given locale, ignoring case', () => {
    expect(['beta', 'Alpha', 'Äpfel'].sort((a, b) => compareLabels(a, b, 'de'))).toEqual(['Alpha', 'Äpfel', 'beta']);
  });
});
