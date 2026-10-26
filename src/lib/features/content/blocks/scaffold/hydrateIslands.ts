// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Hydrates a Svelte-rendered leaf block on the public page in place, from the
// props in its `data-props` attribute. No inline script: the component comes
// from the app bundle, which keeps this inside the reader routes' CSP. Not the
// scheme regions of color/schemeRegions.ts.
import { hydrate, unmount, type Component } from 'svelte';

export const ISLAND_ATTR = 'data-island';
export const ISLAND_PROPS_ATTR = 'data-props';

/** ` data-island="kind" data-props="…"` for a block's wrapper; `esc` is the renderer's attribute escaper. */
export function islandMarker(kind: string, props: Record<string, unknown>, esc: (s: string) => string): string {
  return ` ${ISLAND_ATTR}="${esc(kind)}" ${ISLAND_PROPS_ATTR}="${esc(JSON.stringify(props))}"`;
}

const claimed = new WeakSet<Element>();

/**
 * Hydrates every unclaimed island under `root` whose kind the registry knows.
 * Returns the teardown, which a page that swaps its content calls first.
 */
export function hydrateIslands(root: ParentNode, registry: Record<string, Component<any>>): () => void {
  const instances: Record<string, unknown>[] = [];
  for (const el of root.querySelectorAll<HTMLElement>(`[${ISLAND_ATTR}]`)) {
    if (claimed.has(el)) continue;
    const component = registry[el.getAttribute(ISLAND_ATTR) ?? ''];
    if (!component) continue;
    const props = JSON.parse(el.getAttribute(ISLAND_PROPS_ATTR) || '{}') as Record<string, unknown>;
    claimed.add(el);
    instances.push(hydrate(component, { target: el, props }));
  }
  return () => {
    for (const instance of instances) unmount(instance);
  };
}
