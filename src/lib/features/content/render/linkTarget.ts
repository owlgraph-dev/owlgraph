// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The link-target policy a quick-link card and the link picker share: an
// absolute http(s) or mailto URL, or a path on this site. javascript:, data:,
// a protocol-relative `//host` and bare words are no target.

/**
 * The target itself, or `#` when it is none. Returns the RAW address —
 * callers that put it in HTML escape it themselves.
 */
export function safeTargetHref(value: unknown): string {
  if (typeof value !== 'string') return '#';
  const s = value.trim();
  if (/^https?:\/\//i.test(s) || /^mailto:/i.test(s)) return s;
  if (/^\/[^/]/.test(s) || s === '/') return s; // a path on this site
  return '#';
}

/**
 * Forgiving normalization of a typed address: an explicit scheme or a site
 * path stays as it is, a bare domain like "example.com" gets https://.
 * Anything else is returned untouched so validation can flag it.
 */
export function normalizeUrl(input: unknown): string {
  if (typeof input !== 'string') return '';
  const s = input.trim();
  if (!s) return '';
  if (/^(https?:\/\/|mailto:)/i.test(s)) return s;
  if (s.startsWith('/')) return s;
  if (/^[^\s/]+\.[^\s]+$/.test(s)) return `https://${s}`; // bare domain → https
  return s;
}

/** Is a (normalized) address a valid target? false → the field should warn. */
export function isValidUrl(value: unknown): boolean {
  return safeTargetHref(value) !== '#';
}

/**
 * What a link picker's typed text links to, if it is an address at all: a
 * URL with its scheme, a bare domain (saved as https://…) or a path on this
 * site (/search?class=concept). '' for anything else — a word is a search
 * for a page, not an address.
 */
export function linkTargetFromQuery(query: string): string {
  const q = query.trim();
  if (!q || /\s/.test(q)) return '';
  if (!/^https?:\/\//i.test(q) && !/^[^\s/]+\.[^\s/]{2,}/.test(q) && !q.startsWith('/')) return '';
  const n = normalizeUrl(q);
  return isValidUrl(n) ? n : '';
}
