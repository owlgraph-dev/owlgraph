// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Looser than a link target (linkTarget.ts): a text link may be an anchor, a
// relative path or a phone number, so it is refused by scheme. Browsers ignore
// tabs, newlines and leading control characters (`java\tscript:` is
// `javascript:`), so they go before the scheme is read.
const ALLOWED_SCHEMES = new Set(['http', 'https', 'mailto', 'tel']);

export function safeLinkHref(value: unknown): string {
  if (typeof value !== 'string') return '#';
  const href = value.trim();
  const probe = href.replace(/[\u0000- \u007f]+/g, '');
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(probe)?.[1]?.toLowerCase();
  if (scheme && !ALLOWED_SCHEMES.has(scheme)) return '#';
  return href || '#';
}
