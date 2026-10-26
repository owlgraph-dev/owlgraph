// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Client-safe, so the browser validates with the function the server enforces.
// The server never fetches the URL (docs/architecture/documents.md), so validation is
// purely syntactic.

// 'plugin': the content lives with another service, reached through an integration (docs/architecture/plugins.md).
export type DocumentSource = 'upload' | 'link' | 'plugin';

export const MAX_EXTERNAL_URL_LENGTH = 2048;

export type ExternalUrlError = 'empty' | 'invalid' | 'scheme' | 'credentials' | 'too-long';

export type ParsedExternalUrl = { ok: true; url: string } | { ok: false; reason: ExternalUrlError };

// `doi:10.1000/x` or a bare `10.1000/x`, rewritten to its resolver URL.
const DOI = /^(?:doi:\s*)?(10\.\d{4,9}\/\S+)$/i;

export function parseExternalUrl(input: string): ParsedExternalUrl {
  const trimmed = input.trim();
  if (trimmed === '') return { ok: false, reason: 'empty' };
  const doi = DOI.exec(trimmed);
  const candidate = doi ? `https://doi.org/${doi[1]}` : trimmed;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return { ok: false, reason: 'scheme' };
  if (url.username || url.password) return { ok: false, reason: 'credentials' };
  if (!url.hostname) return { ok: false, reason: 'invalid' };
  if (url.href.length > MAX_EXTERNAL_URL_LENGTH) return { ok: false, reason: 'too-long' };
  return { ok: true, url: url.href };
}

// Empty for anything that doesn't parse.
export function externalHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

// The render-side guard: a row written past the API (a restore, a hand edit)
// can never become a javascript: href.
export function safeExternalHref(url: string | null | undefined): string | null {
  if (!url) return null;
  const parsed = parseExternalUrl(url);
  return parsed.ok ? parsed.url : null;
}
