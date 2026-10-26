// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// How a listing writes a file's facts. Dates are UTC, so a hydrated listing
// reads exactly as its server render did.

/** A text's `{key}` placeholders filled in; an unknown key stays as written. */
export const fill = (text: string, values: Record<string, string | number>) =>
  text.replace(/\{(\w+)\}/g, (whole, key: string) => (key in values ? String(values[key]) : whole));

const UNITS = ['byte', 'kilobyte', 'megabyte', 'gigabyte', 'terabyte'] as const;

/** A size in bytes in decimal units ("1.2 MB"); '' for none. */
export function sizeText(bytes: number | null, locale: string): string {
  if (bytes === null) return '';
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < UNITS.length - 1) {
    value /= 1000;
    unit++;
  }
  return new Intl.NumberFormat(locale, { style: 'unit', unit: UNITS[unit], unitDisplay: 'short', maximumFractionDigits: unit === 0 ? 0 : 1 }).format(value);
}

/** A moment's day, in UTC; '' for none. */
export const dateText = (iso: string | null, locale: string) => (iso ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(iso)) : '');

// The same set as platform/servedFile.ts, which serves every other type as a download.
const INLINE = new Set(['application/pdf', 'text/plain', 'text/markdown', 'image/png', 'image/jpeg', 'image/gif', 'image/webp']);

/** Whether a file of this type opens in a tab — so a link to it opens a new one. */
export const opensInline = (mime: string | null) => !!mime && INLINE.has(mime);

/** A file's glyph (the design system's block glyphs): an image, a text, any other file. */
export function fileGlyph(mime: string | null): string {
  if (mime?.startsWith('image/')) return 'image';
  if (mime && (mime.startsWith('text/') || mime === 'application/pdf')) return 'file-text';
  return 'file';
}

/** A file's type as a reader names it — its name's extension, "PDF" — or null when it has none worth showing. */
export function typeLabel(filename: string): string | null {
  const dot = filename.lastIndexOf('.');
  const ext = dot > 0 ? filename.slice(dot + 1) : '';
  return /^[a-z0-9]{1,5}$/i.test(ext) ? ext.toUpperCase() : null;
}
