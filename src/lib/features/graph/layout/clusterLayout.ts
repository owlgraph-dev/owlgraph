// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The Cluster view mode: Standard's simulation plus community forces. Each
// multi-node community is pulled to its centroid and kept apart from the other
// hulls and lone nodes; edges between communities are weaker springs. It shares
// Standard's world coordinates, so a mode switch reorganises instead of re-scattering.
import type { GraphNode, GraphEdge } from '../types';
import { buildNeighbors } from '../nodeGeometry';
import { detectCommunities } from '../communities';
import { DEFAULT_HULL_PADDING } from '../hull';
import {
  applyCohesion,
  applyRepulsion,
  applySprings,
  clampVelocity,
  integrate,
  resolveCircleOverlap,
  resolveCircleOverlapCross,
  resolveLabelOverlap,
  type SimEdgeRef,
} from '../forceStep';
import { buildEdgeRefsIndexed, buildSimNodes, randomOnDisc, scatterRadius, type LayoutSimNode } from './simNodes';
import { DEFAULT_FORCES, type ForceParams } from './forceParams';
import type { LayoutEngine, Point, Viewport } from './types';

const ALPHA_CUTOFF = 0.02;
const ALPHA_DECAY = 0.99;
// A seeded init starts cooler: the seed is near equilibrium, so the change reads as a glide.
const SEEDED_ALPHA = 0.6;
// Once cooled, keep stepping while the separation still moves things,
// bounded so a tug-of-war can't run forever.
const TAIL_FRAMES = 60;
const SETTLE_EPS = 0.5;

// Relative to the sliders, so the picture's compactness doesn't change with them.
const INTER_LINK_RATIO = 0.5; // cross-community springs vs. `link`
const COHESION_RATIO = 0.15; // pull toward the community centroid vs. `link`
export const HULL_GAP_RATIO = 0.2; // hull-to-hull gap vs. `linkDistance`
export const NODE_HULL_GAP_RATIO = 0.08; // lone-node-to-hull gap vs. `linkDistance`
const SEPARATION_FACTOR = 0.3; // share of an overlap corrected per frame
const MAX_SHIFT_RATIO = 1 / 8; // cap on a community's per-frame rigid shift vs. `linkDistance`

// Over the unpinned members only: a dragged node must not inflate the circle
// and shove every other community around.
export interface CommunityCircle {
  x: number;
  y: number;
  radius: number;
  size: number;
}

export function communityCircle(members: readonly LayoutSimNode[], hullPadding = DEFAULT_HULL_PADDING): CommunityCircle | null {
  const free = members.filter((n) => n.fx == null);
  if (free.length === 0) return null;
  let cx = 0, cy = 0;
  for (const n of free) { cx += n.x; cy += n.y; }
  cx /= free.length; cy /= free.length;
  let reach = 0;
  for (const n of free) reach = Math.max(reach, Math.hypot(n.x - cx, n.y - cy) + n.r);
  return { x: cx, y: cy, radius: reach + hullPadding, size: free.length };
}

// x0/y0 remember the start, so the correction can be handed on to the members.
interface Entity {
  x: number; y: number; vx: number; vy: number; fx: number | null; fy: number | null;
  bl: number; br: number; bt: number; bb: number;
  radius: number;
  mass: number;
  x0: number; y0: number;
  members: LayoutSimNode[];
  node: LayoutSimNode | null; // set for a lone-node wrapper
}

const massOf = (e: Entity) => e.mass;

export function createClusterLayout(): LayoutEngine {
  let simNodes: LayoutSimNode[] = [];
  let byId = new Map<string, LayoutSimNode>();
  let groups: string[][] = [];
  let members: LayoutSimNode[][] = []; // parallel to `groups`
  let intraRefs: SimEdgeRef[] = [];
  let interRefs: SimEdgeRef[] = [];
  let crossGroupEdges = new Set<number>();
  let alpha = 1;
  let tail = 0;
  let forces: ForceParams = DEFAULT_FORCES;

  // Handed on to the members as a capped rigid shift; returns the largest shift this frame.
  function separate(): number {
    const k = forces.linkDistance;
    const entities: Entity[] = [];
    const singles: Entity[] = [];
    members.forEach((ms) => {
      if (ms.length > 1) {
        const c = communityCircle(ms);
        if (!c) return;
        entities.push({ x: c.x, y: c.y, x0: c.x, y0: c.y, vx: 0, vy: 0, fx: null, fy: null, bl: -c.radius, br: c.radius, bt: -c.radius, bb: c.radius, radius: c.radius, mass: Math.sqrt(c.size), members: ms, node: null });
      } else if (ms.length === 1) {
        const n = ms[0];
        singles.push({ x: n.x, y: n.y, x0: n.x, y0: n.y, vx: 0, vy: 0, fx: n.fx, fy: n.fy, bl: n.bl, br: n.br, bt: n.bt, bb: n.bb, radius: n.r, mass: 1, members: [], node: n });
      }
    });
    if (entities.length === 0) return 0;
    resolveCircleOverlap(entities, HULL_GAP_RATIO * k, massOf, SEPARATION_FACTOR);
    resolveCircleOverlapCross(singles, entities, NODE_HULL_GAP_RATIO * k, massOf, SEPARATION_FACTOR);

    const maxShift = MAX_SHIFT_RATIO * k;
    let largest = 0;
    for (const e of entities) {
      let dx = e.x - e.x0, dy = e.y - e.y0;
      const d = Math.hypot(dx, dy);
      if (d === 0) continue;
      if (d > maxShift) { dx *= maxShift / d; dy *= maxShift / d; }
      for (const n of e.members) {
        if (n.fx != null) continue;
        n.x += dx; n.y += dy;
      }
      largest = Math.max(largest, Math.min(d, maxShift));
    }
    for (const s of singles) {
      const n = s.node!;
      if (n.fx != null) continue;
      largest = Math.max(largest, Math.hypot(s.x - n.x, s.y - n.y));
      n.x = s.x; n.y = s.y;
    }
    return largest;
  }

  return {
    init(nodes: GraphNode[], edges: GraphEdge[], _viewport: Viewport, seed?: Map<string, Point>) {
      const neighbors = buildNeighbors(nodes, edges);
      const communities = detectCommunities(nodes, edges);
      groups = communities.groups;
      const groupOf = communities.groupOf;

      // A fresh mount scatters each community around its own anchor, so it starts nearly separated.
      const spread = scatterRadius(nodes.length, forces.linkDistance);
      const anchors = groups.map((g) => (g.length > 1 ? randomOnDisc(spread) : null));
      simNodes = buildSimNodes(nodes, neighbors, seed, (n) => {
        const gi = groupOf.get(n.id)!;
        const anchor = anchors[gi];
        if (!anchor) return randomOnDisc(spread);
        const local = randomOnDisc(scatterRadius(groups[gi].length, forces.linkDistance));
        return { x: anchor.x + local.x, y: anchor.y + local.y };
      });
      byId = new Map(simNodes.map((n) => [n.id, n]));
      members = groups.map((g) => g.map((id) => byId.get(id)!));

      intraRefs = [];
      interRefs = [];
      crossGroupEdges = new Set();
      for (const { edgeIndex, ref } of buildEdgeRefsIndexed(simNodes, edges)) {
        const e = edges[edgeIndex];
        if (groupOf.get(e.source) === groupOf.get(e.target)) {
          intraRefs.push(ref);
        } else {
          interRefs.push(ref);
          crossGroupEdges.add(edgeIndex);
        }
      }
      alpha = seed ? SEEDED_ALPHA : 1;
      tail = 0;
    },

    setViewport() {
      // Nothing is placed relative to the viewport; the camera frames the world.
    },

    step() {
      const cooling = alpha > ALPHA_CUTOFF;
      if (!cooling && tail >= TAIL_FRAMES) return false;
      const k = forces.linkDistance;
      applyRepulsion(simNodes, k, forces.repel);
      applySprings(simNodes, intraRefs, k, forces.link);
      applySprings(simNodes, interRefs, k, forces.link * INTER_LINK_RATIO);
      for (const ms of members) {
        if (ms.length > 1) applyCohesion(ms, { strength: forces.link * COHESION_RATIO });
      }
      clampVelocity(simNodes, k / 4);
      integrate(simNodes, { centerX: 0, centerY: 0, alpha: Math.max(alpha, ALPHA_CUTOFF), centerStrength: forces.center });
      const shift = separate();
      // Last, so the rendered frame is overlap-free.
      resolveLabelOverlap(simNodes);
      if (cooling) {
        alpha *= ALPHA_DECAY;
        return true;
      }
      tail++;
      return shift > SETTLE_EPS && tail < TAIL_FRAMES;
    },

    positions() {
      return new Map(simNodes.map((n) => [n.id, { x: n.x, y: n.y }]));
    },

    pin(id: string, x: number, y: number) {
      const n = byId.get(id);
      if (!n) return;
      n.fx = x; n.fy = y;
      n.x = x; n.y = y;
    },

    unpin(id: string) {
      const n = byId.get(id);
      if (n) { n.fx = null; n.fy = null; }
    },

    unpinAll() {
      for (const n of simNodes) { n.fx = null; n.fy = null; }
    },

    reheat(a: number) {
      alpha = Math.max(alpha, a);
      tail = 0;
    },

    setForces(next: ForceParams) {
      forces = next;
    },

    groups() {
      return groups;
    },

    crossGroupEdgeIndices() {
      return crossGroupEdges;
    },
  };
}
