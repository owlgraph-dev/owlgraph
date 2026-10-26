// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// For an untrusted redirect parameter. Resolving against the origin and comparing
// is what makes this safe: a prefix check lets `/\evil.com` through, which
// browsers normalize to `//evil.com`, another host.

/** The path on this origin `raw` names, or null for anything else. */
export function safePath(raw: string | null, origin: string): string | null {
  if (!raw || !raw.startsWith('/') || raw.includes('\\')) return null;
  let url: URL;
  try {
    url = new URL(raw, origin);
  } catch {
    return null;
  }
  if (url.origin !== origin) return null;
  // Dot segments can resolve to "//host" ("/a/..//host"): this origin as a URL,
  // another host once a browser reads it back as a link.
  if (url.pathname.startsWith('//')) return null;
  return url.pathname + url.search + url.hash;
}

/** Where to send the browser after sign-in: the path `raw` names on this origin, or `/`. */
export function safeRedirect(raw: string | null, origin: string): string {
  return safePath(raw, origin) ?? '/';
}
