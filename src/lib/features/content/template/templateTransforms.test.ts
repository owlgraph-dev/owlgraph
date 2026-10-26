// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  applyTransform,
  transformIdsForCategory,
  isTransformAllowed,
  categoryForDatatype,
  declaredTypeMismatch,
  INTRINSIC_SOURCE_CATEGORY,
  TRANSFORMS_BY_CATEGORY,
  UNIVERSAL_TRANSFORM_IDS,
  type TransformId
} from './templateTransforms';
import { overwriteGetLocale, baseLocale } from '$lib/paraglide/runtime';

// Every test starts pinned to 'de', whose formatting differs most from the raw
// value; under node getLocale() would give 'en'. The override is permanent, so reset it.
const pinLocale = (locale: 'en' | 'de') => overwriteGetLocale(() => locale);
beforeEach(() => pinLocale('de'));
afterEach(() => {
  overwriteGetLocale(() => baseLocale);
  vi.useRealTimers();
});

// ICU emits U+202F/U+00A0 in some output ("42 %").
const norm = (s: string) => s.replace(/[  ]/g, ' ');

describe('declaredTypeMismatch() — template parameter contract vs. bound source', () => {
  it('is null when the categories agree', () => {
    expect(declaredTypeMismatch('date', 'date')).toBeNull();
    expect(declaredTypeMismatch('number', 'number')).toBeNull();
  });

  it('treats text and longtext as the same contract', () => {
    expect(declaredTypeMismatch('longtext', categoryForDatatype('text'))).toBeNull();
    expect(declaredTypeMismatch('text', categoryForDatatype('longtext'))).toBeNull();
  });

  it('reports a category mismatch (warn-but-allow — the caller decides how to surface it)', () => {
    expect(declaredTypeMismatch('date', 'text')).toEqual({ declared: 'date', actual: 'text' });
    expect(declaredTypeMismatch('url', INTRINSIC_SOURCE_CATEGORY.createdAt)).toEqual({ declared: 'url', actual: 'date' });
  });

  it('is null when there is nothing to compare: no declared type (legacy parameter) or an unknown source type', () => {
    expect(declaredTypeMismatch(null, 'text')).toBeNull();
    expect(declaredTypeMismatch('', 'text')).toBeNull();
    expect(declaredTypeMismatch('date', null)).toBeNull();
  });
});

describe('applyTransform()', () => {
  it('returns the value unchanged when no transform spec is given', () => {
    expect(applyTransform('hello', undefined)).toBe('hello');
    expect(applyTransform('hello', null)).toBe('hello');
  });

  it('year: extracts the calendar year from a date string', () => {
    expect(applyTransform('2024-03-15', { id: 'year' })).toBe('2024');
  });

  it('year: returns the original value if it does not parse as a date', () => {
    expect(applyTransform('not-a-date', { id: 'year' })).toBe('not-a-date');
  });

  it('truncate: cuts to the given length and appends an ellipsis', () => {
    expect(applyTransform('hello world', { id: 'truncate', params: { length: '5' } })).toBe('hello…');
  });

  it('truncate: leaves short values untouched', () => {
    expect(applyTransform('hi', { id: 'truncate', params: { length: '5' } })).toBe('hi');
  });

  it('truncate: defaults to 100 when length is missing/invalid', () => {
    const long = 'x'.repeat(150);
    expect(applyTransform(long, { id: 'truncate' })).toBe(`${'x'.repeat(100)}…`);
  });

  it('uppercase / lowercase', () => {
    expect(applyTransform('Hello', { id: 'uppercase' })).toBe('HELLO');
    expect(applyTransform('Hello', { id: 'lowercase' })).toBe('hello');
  });

  it('defaultIfEmpty: substitutes the fallback only when the value is empty/whitespace', () => {
    expect(applyTransform('', { id: 'defaultIfEmpty', params: { fallback: 'n/a' } })).toBe('n/a');
    expect(applyTransform('   ', { id: 'defaultIfEmpty', params: { fallback: 'n/a' } })).toBe('n/a');
    expect(applyTransform('real value', { id: 'defaultIfEmpty', params: { fallback: 'n/a' } })).toBe('real value');
  });

  it('an unrecognized transform id is a no-op, never an error', () => {
    // @ts-expect-error deliberately testing an unknown id
    expect(applyTransform('hello', { id: 'not-a-real-transform' })).toBe('hello');
  });
});

describe('type-keyed registry', () => {
  it('transformIdsForCategory appends the universal set to every category', () => {
    for (const cat of Object.keys(TRANSFORMS_BY_CATEGORY) as (keyof typeof TRANSFORMS_BY_CATEGORY)[]) {
      const ids = transformIdsForCategory(cat);
      for (const u of UNIVERSAL_TRANSFORM_IDS) expect(ids).toContain(u);
    }
  });

  it('reference category offers only universal transforms', () => {
    expect(transformIdsForCategory('reference')).toEqual([...UNIVERSAL_TRANSFORM_IDS]);
  });

  it('isTransformAllowed: date transforms are not allowed for text, universal is allowed everywhere', () => {
    expect(isTransformAllowed('dateMonthDay', 'text')).toBe(false);
    expect(isTransformAllowed('uppercase', 'text')).toBe(true);
    expect(isTransformAllowed('defaultIfEmpty', 'reference')).toBe(true);
  });

  it('categoryForDatatype: known datatypes map, longtext/ad hoc/unknown fall back to text, page is reference', () => {
    expect(categoryForDatatype('number')).toBe('number');
    expect(categoryForDatatype('date')).toBe('date');
    expect(categoryForDatatype('boolean')).toBe('boolean');
    expect(categoryForDatatype('url')).toBe('url');
    expect(categoryForDatatype('page')).toBe('reference');
    expect(categoryForDatatype('text')).toBe('text');
    expect(categoryForDatatype('longtext')).toBe('text');
    expect(categoryForDatatype('')).toBe('text');
    expect(categoryForDatatype(undefined)).toBe('text');
    expect(categoryForDatatype('made-up')).toBe('text');
  });

  it('intrinsic mapping-source keys carry their static categories', () => {
    expect(INTRINSIC_SOURCE_CATEGORY.createdAt).toBe('date');
    expect(INTRINSIC_SOURCE_CATEGORY.updatedAt).toBe('date');
    expect(INTRINSIC_SOURCE_CATEGORY.title).toBe('text');
    expect(INTRINSIC_SOURCE_CATEGORY.url).toBe('url');
    expect(INTRINSIC_SOURCE_CATEGORY.externalUrl).toBe('url');
    expect(INTRINSIC_SOURCE_CATEGORY.namespace).toBe('reference');
    // A resolved label, but text so a class chip can take case/truncate transforms.
    expect(INTRINSIC_SOURCE_CATEGORY.class).toBe('text');
  });
});

describe('date transforms (UTC, locale-aware)', () => {
  it('dateMonthDay (headline): localized month + day', () => {
    expect(applyTransform('2024-03-15', { id: 'dateMonthDay' })).toBe('15. März'); // de (base locale)
    pinLocale('en');
    expect(applyTransform('2024-03-15', { id: 'dateMonthDay' })).toBe('March 15');
  });

  it('dateShort / dateMonthYear / dateTimeFull format via Intl in the active locale', () => {
    expect(applyTransform('2024-03-15', { id: 'dateShort' })).toBe('15.03.2024'); // de medium
    expect(applyTransform('2024-03-15', { id: 'dateMonthYear' })).toBe('März 2024');
    expect(norm(applyTransform('2024-03-15T14:30:00Z', { id: 'dateTimeFull' }))).toBe('15.03.2024, 14:30');
    pinLocale('en');
    expect(applyTransform('2024-03-15', { id: 'dateShort' })).toBe('Mar 15, 2024');
  });

  it('month / day / isoDate extract in UTC', () => {
    expect(applyTransform('2024-03-05', { id: 'month' })).toBe('3');
    expect(applyTransform('2024-03-05', { id: 'day' })).toBe('5');
    expect(applyTransform('2024-03-05T14:30:00Z', { id: 'isoDate' })).toBe('2024-03-05');
  });

  it('year is UTC — a timestamp just before midnight Jan 1 UTC stays in its own year regardless of server TZ', () => {
    expect(applyTransform('2024-12-31T23:30:00Z', { id: 'year' })).toBe('2024');
  });

  it('malformed date input returns the raw value unchanged for every date transform', () => {
    for (const id of TRANSFORMS_BY_CATEGORY.date) {
      expect(applyTransform('not-a-date', { id })).toBe('not-a-date');
    }
  });

  it('dateRelative: deterministic unit cutoffs, past and future, numeric:auto phrasing', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-04T12:00:00Z'));
    expect(applyTransform('2026-09-04T11:55:00Z', { id: 'dateRelative' })).toBe('vor 5 Minuten');
    expect(applyTransform('2026-09-04T09:00:00Z', { id: 'dateRelative' })).toBe('vor 3 Stunden');
    expect(applyTransform('2026-09-01T12:00:00Z', { id: 'dateRelative' })).toBe('vor 3 Tagen');
    expect(applyTransform('2026-09-03T12:00:00Z', { id: 'dateRelative' })).toBe('gestern'); // numeric:'auto'
    expect(applyTransform('2026-07-01T12:00:00Z', { id: 'dateRelative' })).toBe('vor 2 Monaten');
    expect(applyTransform('2023-09-04T12:00:00Z', { id: 'dateRelative' })).toBe('vor 3 Jahren');
    expect(applyTransform('2026-09-06T12:00:00Z', { id: 'dateRelative' })).toBe('übermorgen'); // future
    pinLocale('en');
    expect(applyTransform('2026-09-01T12:00:00Z', { id: 'dateRelative' })).toBe('3 days ago');
  });
});

describe('number transforms (locale-aware)', () => {
  it('numberFormat: thousands separator per locale', () => {
    expect(applyTransform('1234.5', { id: 'numberFormat' })).toBe('1.234,5'); // de
    pinLocale('en');
    expect(applyTransform('1234.5', { id: 'numberFormat' })).toBe('1,234.5');
  });

  it('round: precision param with default 0', () => {
    expect(applyTransform('3.14159', { id: 'round', params: { precision: '2' } })).toBe('3,14'); // de decimal comma
    expect(applyTransform('3.7', { id: 'round' })).toBe('4');
  });

  it('fixedDecimals: min=max digits, default 2, out-of-range param clamps without throwing', () => {
    expect(applyTransform('3.1', { id: 'fixedDecimals' })).toBe('3,10');
    expect(applyTransform('3', { id: 'fixedDecimals', params: { decimals: '99' } })).not.toBe('3'); // clamped to 20, no throw
  });

  it('percent: ratio input — 0.42 renders as 42 %', () => {
    expect(norm(applyTransform('0.42', { id: 'percent' }))).toBe('42 %'); // de spaces the sign
    pinLocale('en');
    expect(norm(applyTransform('0.42', { id: 'percent' }))).toBe('42%');
  });

  it('malformed number input returns the raw value unchanged for every number transform', () => {
    for (const id of TRANSFORMS_BY_CATEGORY.number) {
      expect(applyTransform('abc', { id })).toBe('abc');
      expect(applyTransform('', { id })).toBe('');
    }
  });
});

describe('text transforms', () => {
  it('capitalize / trim', () => {
    expect(applyTransform('hello world', { id: 'capitalize' })).toBe('Hello world');
    expect(applyTransform('', { id: 'capitalize' })).toBe('');
    expect(applyTransform('  padded  ', { id: 'trim' })).toBe('padded');
  });
});

describe('boolean transforms', () => {
  it('yesNo: recognized tokens localize, unrecognized returns raw', () => {
    expect(applyTransform('true', { id: 'yesNo' })).toBe('Ja'); // de
    expect(applyTransform('0', { id: 'yesNo' })).toBe('Nein');
    expect(applyTransform(' YES ', { id: 'yesNo' })).toBe('Ja');
    expect(applyTransform('nein', { id: 'yesNo' })).toBe('Nein');
    expect(applyTransform('maybe', { id: 'yesNo' })).toBe('maybe');
    pinLocale('en');
    expect(applyTransform('true', { id: 'yesNo' })).toBe('Yes');
  });

  it('boolLabels: custom labels with yes/no fallbacks', () => {
    expect(applyTransform('true', { id: 'boolLabels', params: { trueLabel: 'Aktiv', falseLabel: 'Inaktiv' } })).toBe('Aktiv');
    expect(applyTransform('false', { id: 'boolLabels', params: { trueLabel: 'Aktiv', falseLabel: 'Inaktiv' } })).toBe('Inaktiv');
    expect(applyTransform('true', { id: 'boolLabels' })).toBe('Ja'); // fallback to localized yes
    expect(applyTransform('maybe', { id: 'boolLabels' })).toBe('maybe');
  });
});

describe('url transforms', () => {
  it('urlDomain: hostname, with a https:// retry for bare domains', () => {
    expect(applyTransform('https://www.example.com/a/b?c=1', { id: 'urlDomain' })).toBe('www.example.com');
    expect(applyTransform('example.com/path', { id: 'urlDomain' })).toBe('example.com');
  });

  it('urlPretty: strips protocol, www and trailing slash', () => {
    expect(applyTransform('https://www.example.com/docs/', { id: 'urlPretty' })).toBe('example.com/docs');
    expect(applyTransform('plain text', { id: 'urlPretty' })).toBe('plain text');
  });
});

describe('never-throw guarantee', () => {
  const ALL_IDS = [...new Set(Object.values(TRANSFORMS_BY_CATEGORY).flat().concat([...UNIVERSAL_TRANSFORM_IDS]))] as TransformId[];
  const HOSTILE_INPUTS = ['', '  ', 'null', '💥', '9'.repeat(400)];

  it('every transform id survives every hostile input without throwing (with and without params)', () => {
    for (const id of ALL_IDS) {
      for (const input of HOSTILE_INPUTS) {
        expect(() => applyTransform(input, { id })).not.toThrow();
        expect(() => applyTransform(input, { id, params: { length: 'x', precision: '-5', decimals: '999', fallback: '', trueLabel: '', falseLabel: '' } })).not.toThrow();
      }
    }
  });
});
