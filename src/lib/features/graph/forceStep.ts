// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// DOM-free force-simulation primitives, shared by both layout engines and the
// cluster engine's community circles.

export interface SimNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx: number | null;
  fy: number | null;
  // Bounding-box extents from the centre.
  bl: number;
  br: number;
  bt: number;
  bb: number;
}

// Pre-resolved to array indices, so a tick does no Map lookup per edge.
export interface SimEdgeRef {
  aIndex: number;
  bIndex: number;
}

// O(n^2), 1/d^2 falloff. `kFor` overrides the spacing per pair; `massFor`
// divides each side's velocity change by its mass (default 1).
export function applyRepulsion<T extends SimNode>(
  nodes: T[],
  k: number,
  strength = 0.02,
  kFor?: (a: T, b: T) => number,
  massFor?: (n: T) => number
): void {
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i];
    for (let j = i + 1; j < nodes.length; j++) {
      const b = nodes[j];
      const kk = kFor ? kFor(a, b) : k;
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const d2 = dx * dx + dy * dy || 0.01;
      const f = ((kk * kk) / d2) * strength;
      const d = Math.sqrt(d2);
      const ux = dx / d;
      const uy = dy / d;
      const massA = massFor ? massFor(a) : 1;
      const massB = massFor ? massFor(b) : 1;
      a.vx += (ux * f) / massA; a.vy += (uy * f) / massA;
      b.vx -= (ux * f) / massB; b.vy -= (uy * f) / massB;
    }
  }
}

// `kFor` overrides the rest length per edge; `massFor` as in applyRepulsion.
export function applySprings<T extends SimNode>(
  nodes: T[],
  edgeRefs: SimEdgeRef[],
  k: number,
  strength = 0.01,
  kFor?: (a: T, b: T) => number,
  massFor?: (n: T) => number
): void {
  for (const { aIndex, bIndex } of edgeRefs) {
    const a = nodes[aIndex];
    const b = nodes[bIndex];
    if (!a || !b) continue;
    const kk = kFor ? kFor(a, b) : k;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
    const f = (d - kk) * strength;
    const ux = dx / d;
    const uy = dy / d;
    const massA = massFor ? massFor(a) : 1;
    const massB = massFor ? massFor(b) : 1;
    a.vx += (ux * f) / massA; a.vy += (uy * f) / massA;
    b.vx -= (ux * f) / massB; b.vy -= (uy * f) / massB;
  }
}

// Pulls the set toward its centroid, holding a community together beyond what its edges do.
export function applyCohesion<T extends SimNode>(
  nodes: T[],
  opts: { strength: number }
): void {
  if (nodes.length === 0) return;
  let cx = 0, cy = 0;
  for (const n of nodes) { cx += n.x; cy += n.y; }
  cx /= nodes.length; cy /= nodes.length;
  for (const n of nodes) {
    n.vx += (cx - n.x) * opts.strength;
    n.vy += (cy - n.y) * opts.strength;
  }
}

// Two nodes on top of each other see a near-unbounded 1/d² repulsion; uncapped,
// one is flung across the world and the fit camera zooms out after it.
export function clampVelocity<T extends SimNode>(nodes: T[], maxSpeed: number): void {
  const max2 = maxSpeed * maxSpeed;
  for (const n of nodes) {
    const v2 = n.vx * n.vx + n.vy * n.vy;
    if (v2 > max2) {
      const s = maxSpeed / Math.sqrt(v2);
      n.vx *= s; n.vy *= s;
    }
  }
}

// Pinned nodes (fx/fy set) snap to their pin; the rest get centering, damping
// and a move scaled by the cooling alpha.
export function integrate<T extends SimNode>(
  nodes: T[],
  opts: {
    centerX: number;
    centerY: number;
    alpha: number;
    centerStrength?: number;
    centerStrengthFor?: (n: T) => number;
    damping?: number;
    timeScale?: number;
  }
): void {
  const centerStrength = opts.centerStrength ?? 0.0005;
  const damping = opts.damping ?? 0.85;
  const timeScale = opts.timeScale ?? 4;
  for (const n of nodes) {
    if (n.fx != null && n.fy != null) {
      n.x = n.fx; n.y = n.fy; n.vx = 0; n.vy = 0;
      continue;
    }
    const cs = opts.centerStrengthFor ? opts.centerStrengthFor(n) : centerStrength;
    n.vx += (opts.centerX - n.x) * cs;
    n.vy += (opts.centerY - n.y) * cs;
    n.vx *= damping; n.vy *= damping;
    n.x += n.vx * opts.alpha * timeScale;
    n.y += n.vy * opts.alpha * timeScale;
  }
}

// Resolves bounding-box overlaps along the axis of least penetration. Pinned nodes don't move.
export function resolveLabelOverlap<T extends SimNode>(nodes: T[]): void {
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i];
    for (let j = i + 1; j < nodes.length; j++) {
      const b = nodes[j];
      const ox = Math.min(a.x + a.br, b.x + b.br) - Math.max(a.x + a.bl, b.x + b.bl);
      if (ox <= 0) continue;
      const oy = Math.min(a.y + a.bb, b.y + b.bb) - Math.max(a.y + a.bt, b.y + b.bt);
      if (oy <= 0) continue;
      const aPin = a.fx != null;
      const bPin = b.fx != null;
      if (aPin && bPin) continue;
      if (ox < oy) {
        const dir = a.x + (a.bl + a.br) / 2 <= b.x + (b.bl + b.br) / 2 ? 1 : -1;
        if (aPin) b.x += dir * ox;
        else if (bPin) a.x -= dir * ox;
        else { a.x -= dir * ox * 0.5; b.x += dir * ox * 0.5; }
      } else {
        const dir = a.y + (a.bt + a.bb) / 2 <= b.y + (b.bt + b.bb) / 2 ? 1 : -1;
        if (aPin) b.y += dir * oy;
        else if (bPin) a.y -= dir * oy;
        else { a.y -= dir * oy * 0.5; b.y += dir * oy * 0.5; }
      }
    }
  }
}

// Pushes the pair to at least the sum of their radii plus padding; a heavier
// side moves less. A `correctionFactor` below 1 spreads the push over frames.
function resolveOverlapPair<T extends SimNode & { radius: number }>(
  a: T,
  b: T,
  padding: number,
  massFor?: (n: T) => number,
  correctionFactor = 1
): void {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dist = Math.hypot(dx, dy) || 0.01;
  const minDist = a.radius + b.radius + padding;
  if (dist >= minDist) return;
  const overlap = (minDist - dist) * correctionFactor;
  const ux = dx / dist;
  const uy = dy / dist;
  const aPin = a.fx != null;
  const bPin = b.fx != null;
  if (aPin && bPin) return;
  if (aPin) { b.x -= ux * overlap; b.y -= uy * overlap; }
  else if (bPin) { a.x += ux * overlap; a.y += uy * overlap; }
  else {
    const massA = massFor ? massFor(a) : 1;
    const massB = massFor ? massFor(b) : 1;
    const shareA = massB / (massA + massB);
    const shareB = massA / (massA + massB);
    a.x += ux * overlap * shareA; a.y += uy * overlap * shareA;
    b.x -= ux * overlap * shareB; b.y -= uy * overlap * shareB;
  }
}

// A hard separation, not a force: it keeps the community hulls apart, where repulsion would only nudge them.
export function resolveCircleOverlap<T extends SimNode & { radius: number }>(
  nodes: T[],
  padding = 0,
  massFor?: (n: T) => number,
  correctionFactor = 1
): void {
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      resolveOverlapPair(nodes[i], nodes[j], padding, massFor, correctionFactor);
    }
  }
}

// As resolveCircleOverlap, but only between the two sets, never within either.
export function resolveCircleOverlapCross<T extends SimNode & { radius: number }>(
  setA: T[],
  setB: T[],
  padding = 0,
  massFor?: (n: T) => number,
  correctionFactor = 1
): void {
  for (const a of setA) {
    for (const b of setB) {
      resolveOverlapPair(a, b, padding, massFor, correctionFactor);
    }
  }
}
