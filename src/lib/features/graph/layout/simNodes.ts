// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Seeding: a node keeps a position handed in, a new node starts next to a
// placed neighbour, and anything else follows the engine's scatter rule.
import type { GraphNode, GraphEdge } from '../types';
import { nodeRadius } from '../nodeGeometry';
import type { SimNode, SimEdgeRef } from '../forceStep';
import type { Point } from './types';

export interface LayoutSimNode extends SimNode {
  id: string;
  deg: number;
  r: number;
}

// Grows with the count, so a large graph doesn't start as one heap that repulsion must explode.
export function scatterRadius(count: number, linkDistance: number): number {
  return Math.max(60, (linkDistance * Math.sqrt(count)) / 2);
}

export function randomOnDisc(radius: number): Point {
  const ang = Math.random() * Math.PI * 2;
  const rad = Math.sqrt(Math.random()) * radius;
  return { x: Math.cos(ang) * rad, y: Math.sin(ang) * rad };
}

// Jittered, so two nodes placed at one spot can separate.
function nearPoint(p: Point): Point {
  const ang = Math.random() * Math.PI * 2;
  const rad = 10 + Math.random() * 20;
  return { x: p.x + Math.cos(ang) * rad, y: p.y + Math.sin(ang) * rad };
}

export function buildSimNodes(
  nodes: readonly GraphNode[],
  neighbors: Map<string, Set<string>>,
  seed: Map<string, Point> | undefined,
  scatter: (node: GraphNode) => Point
): LayoutSimNode[] {
  return nodes.map((n) => {
    const deg = neighbors.get(n.id)?.size ?? 0;
    const r = nodeRadius(deg);
    const s = seed?.get(n.id);
    let p: Point;
    if (s) {
      p = s;
    } else {
      const near = [...(neighbors.get(n.id) ?? [])].map((id) => seed?.get(id)).find((q) => q != null);
      p = near ? nearPoint(near) : scatter(n);
    }
    return { id: n.id, deg, r, x: p.x, y: p.y, vx: 0, vy: 0, fx: null, fy: null, bl: -r, br: r, bt: -r, bb: r };
  });
}

// Self-loops and edges to unknown nodes are dropped, so `edgeRefs[i]` need not
// be edge i: buildEdgeRefsIndexed keeps the index.
export function buildEdgeRefs(simNodes: readonly LayoutSimNode[], edges: readonly GraphEdge[]): SimEdgeRef[] {
  return buildEdgeRefsIndexed(simNodes, edges).map((r) => r.ref);
}

export function buildEdgeRefsIndexed(
  simNodes: readonly LayoutSimNode[],
  edges: readonly GraphEdge[]
): { edgeIndex: number; ref: SimEdgeRef }[] {
  const idToIndex = new Map(simNodes.map((n, i) => [n.id, i]));
  const out: { edgeIndex: number; ref: SimEdgeRef }[] = [];
  edges.forEach((e, edgeIndex) => {
    const aIndex = idToIndex.get(e.source);
    const bIndex = idToIndex.get(e.target);
    if (aIndex != null && bIndex != null && aIndex !== bIndex) out.push({ edgeIndex, ref: { aIndex, bIndex } });
  });
  return out;
}
