// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The space slugs the [space] params matcher (src/lib/features/spaces/matcher.ts)
// knows, on the server and in the browser alike, so no imports at all. The
// browser's copy is one viewer's, warmed before hydration (src/hooks.client.ts);
// a stale one only picks the wrong route leaf, whose own load 404s.
//
// The server's copy is every space, whoever asks, so it routes a restricted
// space only under a stamp: the reroute hook (src/hooks.ts) puts it in front of
// the slug for an asker the space admits or who may read a node in it. Anyone
// else's address under it matches no route, as an address under no space does
// (docs/features/002-visibility-and-spaces.md, criterion 21). The stamp is made
// once a process and never leaves the server.
let known = new Set<string>();
/** The restricted spaces' slugs, on the server; null in the browser. */
let restricted: Set<string> | null = null;
let stamp = '';

/** The browser's copy: the slugs this viewer routes by. */
export function setKnownSpaceSlugs(slugs: readonly string[]): void {
  known = new Set(slugs);
}

/** The server's copy: every space's slug, and which of them are restricted. */
export function setServerSpaceSlugs(slugs: readonly string[], restrictedSlugs: readonly string[]): void {
  known = new Set(slugs);
  restricted = new Set(restrictedSlugs);
  stamp ||= `~${globalThis.crypto.randomUUID()}~`;
}

export function isKnownSpaceSlug(slug: string): boolean {
  return known.has(slug);
}

/** The space a route's first segment names, or undefined: a restricted one only under the stamp, on the server. */
export function spaceOfParam(param: string): string | undefined {
  if (restricted === null) return known.has(param) ? param : undefined;
  if (stamp && param.startsWith(stamp)) {
    const slug = param.slice(stamp.length);
    return restricted.has(slug) ? slug : undefined;
  }
  return known.has(param) && !restricted.has(param) ? param : undefined;
}

/** The restricted space a path's first segment names, on the server; null for anything else. */
export function restrictedSpaceOf(segment: string): string | null {
  if (restricted === null) return null;
  let slug: string;
  try {
    slug = decodeURIComponent(segment);
  } catch {
    return null;
  }
  return restricted.has(slug) ? slug : null;
}

/** A restricted space's slug as the matcher takes it, for an asker it opens to. */
export function stampedSpace(slug: string): string {
  return `${stamp}${slug}`;
}
