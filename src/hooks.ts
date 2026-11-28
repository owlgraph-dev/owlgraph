// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The universal hooks. `reroute` lets an address under a restricted space reach
// its route only for an asker the space admits or who may read a node in it:
// for anyone else it matches no route, as an address under no space does
// (docs/architecture/routing.md, "A restricted space's addresses"). On the
// server only: the browser's registry holds the viewer's own spaces already,
// so there the registry names no restricted space and this returns at once.
import type { Reroute } from '@sveltejs/kit/hooks';
import { restrictedSpaceOf, stampedSpace } from '#lib/features/spaces/index.ts';

export const reroute: Reroute = async ({ url, fetch }) => {
  const [, first = '', second, ...rest] = url.pathname.split('/');
  // A space's addresses all have a node's slug after it.
  if (!second) return;
  const slug = restrictedSpaceOf(first);
  if (!slug || !(await routesFor(fetch, slug))) return;
  return ['', stampedSpace(slug), second, ...rest].join('/');
};

/** Whether the asker's own routing slugs, asked with their session, list the space; no answer is no. */
async function routesFor(fetch: typeof globalThis.fetch, slug: string): Promise<boolean> {
  try {
    const res = await fetch('/api/spaces/slugs');
    return res.ok && ((await res.json()) as string[]).includes(slug);
  } catch {
    return false;
  }
}
