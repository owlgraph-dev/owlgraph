// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect, afterEach } from 'vitest';
import { parseLocalizedText, localizedTextFromForm } from './localizedText.server';
import { FALLBACK_SITE_LOCALES, setSiteLocaleConfig } from './siteLocales';

afterEach(() => setSiteLocaleConfig(FALLBACK_SITE_LOCALES));

function form(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

function refusal(run: () => unknown): unknown {
  try {
    run();
  } catch (e) {
    return e;
  }
  throw new Error('expected a refusal');
}

describe('parseLocalizedText()', () => {
  it('trims values and drops blanks', () => {
    expect(parseLocalizedText({ de: '  Kern ', en: '   ' })).toEqual({ de: 'Kern' });
  });

  it('treats null/undefined as the empty value', () => {
    expect(parseLocalizedText(null)).toEqual({});
    expect(parseLocalizedText(undefined)).toEqual({});
  });

  it('refuses a locale that is not supported', () => {
    expect(refusal(() => parseLocalizedText({ fr: 'Noyau' }))).toMatchObject({
      code: 'invalid_translations',
      message: expect.stringMatching(/supported languages/),
      details: { languages: 'en, de' },
    });
  });

  it('refuses anything that is not a string map', () => {
    expect(() => parseLocalizedText('Core')).toThrow();
    expect(() => parseLocalizedText({ en: 42 })).toThrow();
  });
});

describe('localizedTextFromForm()', () => {
  it('reads one input per configured locale, named <name>.<locale>', () => {
    expect(localizedTextFromForm(form({ 'label.en': 'Abstract', 'label.de': 'Zusammenfassung' }), 'label', { required: true, what: 'label' })).toEqual({
      en: 'Abstract',
      de: 'Zusammenfassung',
    });
  });

  it('requires the site default (en) when required', () => {
    expect(refusal(() => localizedTextFromForm(form({ 'label.de': 'Zusammenfassung' }), 'label', { required: true, what: 'label' }))).toMatchObject({
      code: 'default_text_required',
      message: expect.stringMatching(/default language \(en\)/),
      details: { field: 'label', what: 'label', locale: 'en' },
    });
  });

  it('requires whatever the site default language is', () => {
    setSiteLocaleConfig({ enabled: ['en', 'de'], defaultLocale: 'de' });
    expect(() => localizedTextFromForm(form({ 'label.en': 'Abstract' }), 'label', { required: true, what: 'label' })).toThrow(/default language \(de\)/);
    expect(localizedTextFromForm(form({ 'label.de': 'Zusammenfassung' }), 'label', { required: true, what: 'label' })).toEqual({ de: 'Zusammenfassung' });
  });

  it('keeps a translation in a disabled language', () => {
    setSiteLocaleConfig({ enabled: ['en'], defaultLocale: 'en' });
    expect(localizedTextFromForm(form({ 'label.en': 'Abstract', 'label.de': 'Zusammenfassung' }), 'label', { required: true, what: 'label' })).toEqual({
      en: 'Abstract',
      de: 'Zusammenfassung',
    });
  });

  it('an optional field may be empty or partial', () => {
    expect(localizedTextFromForm(form({}), 'description', { required: false, what: 'description' })).toEqual({});
    expect(localizedTextFromForm(form({ 'description.de': 'Nur Deutsch' }), 'description', { required: false, what: 'description' })).toEqual({ de: 'Nur Deutsch' });
  });

  it('ignores inputs for locales that are not configured', () => {
    expect(localizedTextFromForm(form({ 'label.en': 'Core', 'label.fr': 'Noyau' }), 'label', { required: true, what: 'label' })).toEqual({ en: 'Core' });
  });
});
