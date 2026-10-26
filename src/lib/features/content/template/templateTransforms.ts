// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Value transforms for query-template binding. A security boundary: stored
// config names a transform by a fixed `id` with string params, and no path
// leads from it to eval or dynamic code. An unknown id is a no-op, and a
// transform never throws (malformed input returns the raw value), so stored
// config can never fail a render. The builder offers only the ids for a
// parameter's type category, so no datatype lookup happens at apply time.
// Dates format in UTC, so output doesn't depend on the server's timezone.
import { getLocale } from '$lib/paraglide/runtime';
import * as m from '$lib/paraglide/messages';

export type TransformCategory = 'text' | 'number' | 'date' | 'boolean' | 'url' | 'reference';

export type TransformId =
  // stored pages reference these ids: never rename one
  | 'year'
  | 'truncate'
  | 'uppercase'
  | 'lowercase'
  | 'defaultIfEmpty'
  // date
  | 'dateShort'
  | 'dateMonthDay'
  | 'dateMonthYear'
  | 'dateTimeFull'
  | 'dateRelative'
  | 'month'
  | 'day'
  | 'isoDate'
  // text
  | 'capitalize'
  | 'trim'
  // number
  | 'round'
  | 'fixedDecimals'
  | 'numberFormat'
  | 'percent'
  // boolean
  | 'yesNo'
  | 'boolLabels'
  // url
  | 'urlDomain'
  | 'urlPretty';

export interface TransformSpec {
  id: TransformId;
  // Always strings, coerced at use: widening the type changes every stored mapping.
  params?: Record<string, string>;
}

// Offered for every category, appended after the type-specific set.
export const UNIVERSAL_TRANSFORM_IDS: readonly TransformId[] = ['defaultIfEmpty'];

export const TRANSFORMS_BY_CATEGORY: Record<TransformCategory, readonly TransformId[]> = {
  text: ['uppercase', 'lowercase', 'capitalize', 'truncate', 'trim'],
  number: ['round', 'fixedDecimals', 'numberFormat', 'percent'],
  date: ['dateShort', 'dateMonthDay', 'dateMonthYear', 'dateTimeFull', 'dateRelative', 'year', 'month', 'day', 'isoDate'],
  boolean: ['yesNo', 'boolLabels'],
  url: ['urlDomain', 'urlPretty'],
  // Already resolved labels or identifiers: universal transforms only.
  reference: [],
};

// Unknown or ad-hoc datatypes are text. 'page' is a reference: case or
// truncate on an identifier is meaningless.
export function categoryForDatatype(datatype: string | null | undefined): TransformCategory {
  switch (datatype) {
    case 'number':
      return 'number';
    case 'date':
      return 'date';
    case 'boolean':
      return 'boolean';
    case 'url':
      return 'url';
    case 'page':
      return 'reference';
    default:
      return 'text'; // text, longtext, ad hoc/'', unknown
  }
}

// templateBinding.ts's bindingMap keys, not the filter's IntrinsicField ids:
// mapping uses the label keys ('namespace'), the filter the ids ('namespaceId').
export const INTRINSIC_SOURCE_CATEGORY: Record<string, TransformCategory> = {
  title: 'text',
  slug: 'text',
  url: 'url',
  createdAt: 'date',
  updatedAt: 'date',
  type: 'reference',
  namespace: 'reference',
  creator: 'reference',
  // Text, not a reference: a class name shows as a chip, where case and truncate help.
  class: 'text',
  externalUrl: 'url',
  locale: 'reference',
};

// A parameter's declared type against its source's category, compared by
// category. Null when either is unknown. Callers warn, never block.
export function declaredTypeMismatch(
  declaredType: string | null | undefined,
  sourceCategory: TransformCategory | null | undefined
): { declared: TransformCategory; actual: TransformCategory } | null {
  if (!declaredType || !sourceCategory) return null;
  const declared = categoryForDatatype(declaredType);
  return declared === sourceCategory ? null : { declared, actual: sourceCategory };
}

export function transformIdsForCategory(cat: TransformCategory): TransformId[] {
  return [...TRANSFORMS_BY_CATEGORY[cat], ...UNIVERSAL_TRANSFORM_IDS];
}

export function isTransformAllowed(id: string, cat: TransformCategory): boolean {
  return (transformIdsForCategory(cat) as string[]).includes(id);
}

export const TRANSFORM_LABELS: Record<TransformId, () => string> = {
  year: m.editor_transform_year,
  truncate: m.editor_transform_truncate,
  uppercase: m.editor_transform_uppercase,
  lowercase: m.editor_transform_lowercase,
  defaultIfEmpty: m.editor_transform_default_if_empty,
  dateShort: m.editor_transform_date_short,
  dateMonthDay: m.editor_transform_date_month_day,
  dateMonthYear: m.editor_transform_date_month_year,
  dateTimeFull: m.editor_transform_date_time_full,
  dateRelative: m.editor_transform_date_relative,
  month: m.editor_transform_month,
  day: m.editor_transform_day,
  isoDate: m.editor_transform_iso_date,
  capitalize: m.editor_transform_capitalize,
  trim: m.editor_transform_trim,
  round: m.editor_transform_round,
  fixedDecimals: m.editor_transform_fixed_decimals,
  numberFormat: m.editor_transform_number_format,
  percent: m.editor_transform_percent,
  yesNo: m.editor_transform_yes_no,
  boolLabels: m.editor_transform_bool_labels,
  urlDomain: m.editor_transform_url_domain,
  urlPretty: m.editor_transform_url_pretty,
};

export const TRANSFORM_PARAM_KEYS: Record<TransformId, string[]> = {
  year: [],
  truncate: ['length'],
  uppercase: [],
  lowercase: [],
  defaultIfEmpty: ['fallback'],
  dateShort: [],
  dateMonthDay: [],
  dateMonthYear: [],
  dateTimeFull: [],
  dateRelative: [],
  month: [],
  day: [],
  isoDate: [],
  capitalize: [],
  trim: [],
  round: ['precision'],
  fixedDecimals: ['decimals'],
  numberFormat: [],
  percent: [],
  yesNo: [],
  boolLabels: ['trueLabel', 'falseLabel'],
  urlDomain: [],
  urlPretty: [],
};

export const TRANSFORM_PARAM_LABELS: Record<string, () => string> = {
  length: m.editor_transform_param_length,
  fallback: m.editor_transform_param_fallback,
  precision: m.editor_transform_param_precision,
  decimals: m.editor_transform_param_decimals,
  trueLabel: m.editor_transform_param_trueLabel,
  falseLabel: m.editor_transform_param_falseLabel,
};

function parseDateSafe(v: string): Date | null {
  const d = new Date(v.trim());
  return isNaN(d.getTime()) ? null : d;
}

function parseNumberSafe(v: string): number | null {
  const t = v.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

// Intl throws outside 0–20 fraction digits.
function fractionDigits(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(20, Math.max(0, Math.trunc(n)));
}

const TRUE_TOKENS = new Set(['true', '1', 'yes', 'ja']);
const FALSE_TOKENS = new Set(['false', '0', 'no', 'nein']);

function parseBoolSafe(v: string): boolean | null {
  const t = v.trim().toLowerCase();
  if (TRUE_TOKENS.has(t)) return true;
  if (FALSE_TOKENS.has(t)) return false;
  return null;
}

function parseUrlSafe(v: string): URL | null {
  const t = v.trim();
  try {
    return new URL(t);
  } catch {
    try {
      return new URL(`https://${t}`);
    } catch {
      return null;
    }
  }
}

// numeric:'auto' gives "yesterday" phrasing where the locale has it.
function relativeTime(d: Date, locale: string): string {
  const diffMs = d.getTime() - Date.now(); // negative = past
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const mins = Math.round(diffMs / 60_000);
  if (Math.abs(mins) < 60) return rtf.format(mins, 'minute');
  const hours = Math.round(diffMs / 3_600_000);
  if (Math.abs(hours) < 24) return rtf.format(hours, 'hour');
  const days = Math.round(diffMs / 86_400_000);
  if (Math.abs(days) < 30) return rtf.format(days, 'day');
  const months = Math.round(days / 30.44);
  if (Math.abs(months) < 12) return rtf.format(months, 'month');
  return rtf.format(Math.round(days / 365.25), 'year');
}

const TRANSFORMS: Record<TransformId, (value: string, params?: Record<string, string>) => string> = {
  // --- date ---
  year: (v) => {
    const d = parseDateSafe(v);
    return d ? String(d.getUTCFullYear()) : v;
  },
  month: (v) => {
    const d = parseDateSafe(v);
    return d ? String(d.getUTCMonth() + 1) : v;
  },
  day: (v) => {
    const d = parseDateSafe(v);
    return d ? String(d.getUTCDate()) : v;
  },
  isoDate: (v) => {
    const d = parseDateSafe(v);
    return d ? d.toISOString().slice(0, 10) : v;
  },
  dateShort: (v) => {
    const d = parseDateSafe(v);
    return d ? new Intl.DateTimeFormat(getLocale(), { dateStyle: 'medium', timeZone: 'UTC' }).format(d) : v;
  },
  dateMonthDay: (v) => {
    const d = parseDateSafe(v);
    return d ? new Intl.DateTimeFormat(getLocale(), { month: 'long', day: 'numeric', timeZone: 'UTC' }).format(d) : v;
  },
  dateMonthYear: (v) => {
    const d = parseDateSafe(v);
    return d ? new Intl.DateTimeFormat(getLocale(), { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d) : v;
  },
  dateTimeFull: (v) => {
    const d = parseDateSafe(v);
    return d ? new Intl.DateTimeFormat(getLocale(), { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(d) : v;
  },
  dateRelative: (v) => {
    const d = parseDateSafe(v);
    return d ? relativeTime(d, getLocale()) : v;
  },
  // --- text ---
  uppercase: (v) => v.toLocaleUpperCase(getLocale()),
  lowercase: (v) => v.toLocaleLowerCase(getLocale()),
  capitalize: (v) => (v ? v[0].toLocaleUpperCase(getLocale()) + v.slice(1) : v),
  trim: (v) => v.trim(),
  truncate: (v, p) => {
    const n = Number(p?.length);
    const max = Number.isFinite(n) && n > 0 ? n : 100;
    return v.length > max ? `${v.slice(0, max)}…` : v;
  },
  // --- number (locale-aware via Intl) ---
  round: (v, p) => {
    const n = parseNumberSafe(v);
    if (n === null) return v;
    return new Intl.NumberFormat(getLocale(), { maximumFractionDigits: fractionDigits(p?.precision, 0), useGrouping: false }).format(n);
  },
  fixedDecimals: (v, p) => {
    const n = parseNumberSafe(v);
    if (n === null) return v;
    const digits = fractionDigits(p?.decimals, 2);
    return new Intl.NumberFormat(getLocale(), { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: false }).format(n);
  },
  numberFormat: (v) => {
    const n = parseNumberSafe(v);
    return n === null ? v : new Intl.NumberFormat(getLocale()).format(n);
  },
  // Ratio input: "0.42" -> "42 %" (Intl-native percent semantics).
  percent: (v) => {
    const n = parseNumberSafe(v);
    return n === null ? v : new Intl.NumberFormat(getLocale(), { style: 'percent', maximumFractionDigits: 2 }).format(n);
  },
  // --- boolean ---
  yesNo: (v) => {
    const b = parseBoolSafe(v);
    if (b === null) return v;
    return b ? m.transform_value_yes() : m.transform_value_no();
  },
  boolLabels: (v, p) => {
    const b = parseBoolSafe(v);
    if (b === null) return v;
    return b ? (p?.trueLabel ?? m.transform_value_yes()) : (p?.falseLabel ?? m.transform_value_no());
  },
  // --- url ---
  urlDomain: (v) => parseUrlSafe(v)?.hostname ?? v,
  urlPretty: (v) =>
    v
      .trim()
      .replace(/^https?:\/\//i, '')
      .replace(/^www\./i, '')
      .replace(/\/$/, ''),
  // --- universal ---
  defaultIfEmpty: (v, p) => (v.trim() ? v : (p?.fallback ?? '')),
};

export function applyTransform(value: string, spec?: TransformSpec | null): string {
  if (!spec) return value;
  const fn = TRANSFORMS[spec.id];
  if (!fn) return value;
  try {
    return fn(value, spec.params);
  } catch {
    // A failing transform degrades to the raw value, never a render error.
    return value;
  }
}
