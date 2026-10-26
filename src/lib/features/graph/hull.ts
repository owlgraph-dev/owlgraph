// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { VIZ_COLORS } from './nodeColor';

export interface Pt {
  x: number;
  y: number;
}

// Andrew's monotone chain: counter-clockwise, no repeated closing point. Fewer
// than 3 distinct points come back as they are.
export function convexHull(points: Pt[]): Pt[] {
  const sorted = [...points].sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
  const pts: Pt[] = [];
  for (const p of sorted) {
    const prev = pts[pts.length - 1];
    if (!prev || prev.x !== p.x || prev.y !== p.y) pts.push(p);
  }
  if (pts.length < 3) return pts;

  const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

  const lower: Pt[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper: Pt[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

export function hullToPathD(hull: Pt[]): string {
  if (hull.length === 0) return '';
  const [first, ...rest] = hull;
  const lines = rest.map((p) => `L ${p.x} ${p.y}`).join(' ');
  return `M ${first.x} ${first.y} ${lines} Z`.trim();
}

export const DEFAULT_HULL_PADDING = 14;
const DEFAULT_HULL_SAMPLES = 10;

// A node's circle plus a box (extents from the centre).
export interface InflatableNode {
  x: number;
  y: number;
  r: number;
  bl: number;
  br: number;
  bt: number;
  bb: number;
}

// Hulling points sampled around each circle and box, not the centres, keeps the
// hull clear of the nodes and gives even a one-node group a proper hull.
export function inflatedHullPoints(
  members: InflatableNode[],
  opts?: { samples?: number; padding?: number }
): Pt[] {
  const samples = opts?.samples ?? DEFAULT_HULL_SAMPLES;
  const padding = opts?.padding ?? DEFAULT_HULL_PADDING;
  const points: Pt[] = [];
  for (const m of members) {
    const rad = m.r + padding;
    for (let i = 0; i < samples; i++) {
      const ang = (i / samples) * Math.PI * 2;
      points.push({ x: m.x + Math.cos(ang) * rad, y: m.y + Math.sin(ang) * rad });
    }
    points.push({ x: m.x + m.bl - padding, y: m.y + m.bt - padding });
    points.push({ x: m.x + m.br + padding, y: m.y + m.bt - padding });
    points.push({ x: m.x + m.br + padding, y: m.y + m.bb + padding });
    points.push({ x: m.x + m.bl - padding, y: m.y + m.bb + padding });
  }
  return points;
}

export interface GroupHull {
  groupIndex: number;
  d: string;
  color: string;
}

// Hashed from the members, so a group keeps its colour though every init renumbers the groups.
function colorFor(sortedIds: string[], colors: string[]): string {
  let hash = 0;
  const key = sortedIds.join('|');
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) | 0;
  return colors[Math.abs(hash) % colors.length];
}

// Keyed by the group's index; groups below `minGroupSize` (default 2) get no hull.
export function computeGroupHulls(
  nodesById: Map<string, InflatableNode>,
  groups: string[][],
  opts?: { padding?: number; samples?: number; minGroupSize?: number; colors?: string[] }
): GroupHull[] {
  const minGroupSize = opts?.minGroupSize ?? 2;
  const colors = opts?.colors ?? VIZ_COLORS;
  const hulls: GroupHull[] = [];
  groups.forEach((memberIds, groupIndex) => {
    if (memberIds.length < minGroupSize) return;
    const members = memberIds
      .map((id) => nodesById.get(id))
      .filter((m): m is InflatableNode => !!m);
    if (!members.length) return;
    const cloud = inflatedHullPoints(members, { padding: opts?.padding, samples: opts?.samples });
    const hull = convexHull(cloud);
    const d = hullToPathD(hull);
    const color = colorFor([...memberIds].sort(), colors);
    hulls.push({ groupIndex, d, color });
  });
  return hulls;
}
