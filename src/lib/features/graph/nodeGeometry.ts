// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// One size by degree for the physics, the hulls and the fit camera; the drawn
// circle uses it too unless the view sizes nodes uniformly.

// Saturates, so a hub reads as bigger without dwarfing the graph.
export function nodeRadius(deg: number): number {
  return 6 + Math.min(deg, 6) * 1.5;
}

export const UNIFORM_RADIUS = 8;

const LABEL_MAX_CHARS = 24;

export function truncateLabel(title: string): string {
  return title.length > LABEL_MAX_CHARS ? `${title.slice(0, LABEL_MAX_CHARS)}…` : title;
}

// Undirected; self-loops and edges to unknown nodes are ignored.
export function buildNeighbors(nodes: readonly { id: string }[], edges: readonly { source: string; target: string }[]): Map<string, Set<string>> {
  const neighbors = new Map<string, Set<string>>(nodes.map((n) => [n.id, new Set<string>()]));
  for (const e of edges) {
    if (e.source === e.target) continue;
    const a = neighbors.get(e.source);
    const b = neighbors.get(e.target);
    if (!a || !b) continue;
    a.add(e.target);
    b.add(e.source);
  }
  return neighbors;
}
