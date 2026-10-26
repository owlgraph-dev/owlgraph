// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Community detection for the Cluster view (docs/architecture/graph-view.md): a Louvain kept
// deterministic (input order, ties to the lowest community index, no shuffling),
// so the same graph always gets the same partition and hull colours.
import type { GraphNode, GraphEdge } from './types';
import { buildNeighbors } from './nodeGeometry';

export interface Communities {
  groups: string[][]; // by first appearance; members in input order
  groupOf: Map<string, number>;
}

export interface CommunityOptions {
  // Modularity resolution γ: above 1 favours smaller communities. Not user-facing.
  resolution?: number;
}

// adj[i] = [[j, w], ...]; m = total edge weight, each edge counted once.
interface WGraph {
  n: number;
  adj: [number, number][][];
  degree: number[];
  m: number;
}

const NO_IMPROVEMENT = 1e-12;
const MAX_PASSES = 100;

// One Louvain level's local moving phase; communities renumbered by first appearance.
function localMoving(g: WGraph, gamma: number): { comm: number[]; moved: boolean } {
  const comm = g.adj.map((_, i) => i);
  const tot = g.degree.slice();
  const twoM = 2 * g.m;
  let movedAny = false;
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let movedThisPass = false;
    for (let i = 0; i < g.n; i++) {
      const own = comm[i];
      const ki = g.degree[i];
      tot[own] -= ki;
      // Weight from i into each neighbouring community.
      const kin = new Map<number, number>();
      kin.set(own, 0);
      for (const [j, w] of g.adj[i]) {
        const c = comm[j];
        kin.set(c, (kin.get(c) ?? 0) + w);
      }
      const gainOf = (c: number) => (kin.get(c) ?? 0) - (gamma * ki * tot[c]) / twoM;
      let best = own;
      let bestGain = gainOf(own);
      // Candidates in ascending community index; strictly greater wins.
      for (const c of [...kin.keys()].sort((a, b) => a - b)) {
        if (c === own) continue;
        const gain = gainOf(c);
        if (gain > bestGain + NO_IMPROVEMENT) {
          best = c;
          bestGain = gain;
        }
      }
      comm[i] = best;
      tot[best] += ki;
      if (best !== own) {
        movedThisPass = true;
        movedAny = true;
      }
    }
    if (!movedThisPass) break;
  }
  const index = new Map<number, number>();
  const renumbered = comm.map((c) => {
    let k = index.get(c);
    if (k === undefined) {
      k = index.size;
      index.set(c, k);
    }
    return k;
  });
  return { comm: renumbered, moved: movedAny };
}

// A community's internal edges stay in its degree (twice, as modularity
// requires) but leave no self-loop in the adjacency.
function aggregate(g: WGraph, comm: number[], count: number): WGraph {
  const degree = new Array<number>(count).fill(0);
  const weights = new Map<number, Map<number, number>>();
  for (let i = 0; i < g.n; i++) {
    const a = comm[i];
    degree[a] += g.degree[i];
    for (const [j, w] of g.adj[i]) {
      const b = comm[j];
      if (a === b) continue;
      let row = weights.get(a);
      if (!row) weights.set(a, (row = new Map()));
      row.set(b, (row.get(b) ?? 0) + w);
    }
  }
  const adj: [number, number][][] = Array.from({ length: count }, (_, a) =>
    [...(weights.get(a) ?? new Map<number, number>())].sort((x, y) => x[0] - y[0])
  );
  return { n: count, adj, degree, m: g.m };
}

export function detectCommunities(
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[],
  opts: CommunityOptions = {}
): Communities {
  const gamma = opts.resolution ?? 1;
  const ids = nodes.map((n) => n.id);
  const indexOf = new Map(ids.map((id, i) => [id, i]));
  const neighbors = buildNeighbors(nodes, edges);
  const adj: [number, number][][] = ids.map((id) =>
    [...(neighbors.get(id) ?? [])].map((other) => [indexOf.get(other)!, 1] as [number, number]).sort((a, b) => a[0] - b[0])
  );
  const degree = adj.map((row) => row.length);
  const m = degree.reduce((s, d) => s + d, 0) / 2;

  // Membership of every original node in the current level's communities.
  let membership = ids.map((_, i) => i);
  if (m > 0) {
    let g: WGraph = { n: ids.length, adj, degree, m };
    for (;;) {
      const { comm, moved } = localMoving(g, gamma);
      if (!moved) break;
      membership = membership.map((c) => comm[c]);
      const count = Math.max(...comm) + 1;
      if (count === g.n) break;
      g = aggregate(g, comm, count);
    }
  }

  const groupIndex = new Map<number, number>();
  const groups: string[][] = [];
  const groupOf = new Map<string, number>();
  ids.forEach((id, i) => {
    const c = membership[i];
    let k = groupIndex.get(c);
    if (k === undefined) {
      k = groups.length;
      groupIndex.set(c, k);
      groups.push([]);
    }
    groups[k].push(id);
    groupOf.set(id, k);
  });
  return { groups, groupOf };
}
