// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The namespace slugs the [namespace] params matcher (src/params/namespace.ts)
// knows, on the server and in the browser alike, so no server-only imports. The
// browser's copy is warmed before hydration (src/hooks.client.ts); a stale one
// only picks the wrong route leaf, whose own load 404s.
let known = new Set<string>();

export function setKnownNamespaceSlugs(slugs: readonly string[]): void {
  known = new Set(slugs);
}

export function isKnownNamespaceSlug(slug: string): boolean {
  return known.has(slug);
}
