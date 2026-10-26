// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The Standard view mode: the four classic forces and nothing else. A hard
// overlap pass keeps a low repulsion setting from stacking nodes.
import type { GraphNode, GraphEdge } from '../types';
import { buildNeighbors } from '../nodeGeometry';
import { applyRepulsion, applySprings, clampVelocity, integrate, resolveLabelOverlap, type SimEdgeRef } from '../forceStep';
import { buildEdgeRefs, buildSimNodes, randomOnDisc, scatterRadius, type LayoutSimNode } from './simNodes';
import { DEFAULT_FORCES, type ForceParams } from './forceParams';
import type { LayoutEngine, Point, Viewport } from './types';

const ALPHA_CUTOFF = 0.02;
const ALPHA_DECAY = 0.99;

export function createStandardLayout(): LayoutEngine {
  let simNodes: LayoutSimNode[] = [];
  let byId = new Map<string, LayoutSimNode>();
  let edgeRefs: SimEdgeRef[] = [];
  let alpha = 1;
  let forces: ForceParams = DEFAULT_FORCES;

  return {
    init(nodes: GraphNode[], edges: GraphEdge[], _viewport: Viewport, seed?: Map<string, Point>) {
      const neighbors = buildNeighbors(nodes, edges);
      const spread = scatterRadius(nodes.length, forces.linkDistance);
      simNodes = buildSimNodes(nodes, neighbors, seed, () => randomOnDisc(spread));
      byId = new Map(simNodes.map((n) => [n.id, n]));
      edgeRefs = buildEdgeRefs(simNodes, edges);
      alpha = 1;
    },

    setViewport() {
      // Nothing is placed relative to the viewport; the camera frames the world.
    },

    step() {
      if (alpha <= ALPHA_CUTOFF) return false;
      applyRepulsion(simNodes, forces.linkDistance, forces.repel);
      applySprings(simNodes, edgeRefs, forces.linkDistance, forces.link);
      // integrate() moves a node by v · alpha · 4, so a frame travels at most one link distance.
      clampVelocity(simNodes, forces.linkDistance / 4);
      resolveLabelOverlap(simNodes);
      integrate(simNodes, { centerX: 0, centerY: 0, alpha, centerStrength: forces.center });
      alpha *= ALPHA_DECAY;
      return true;
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
    },

    setForces(next: ForceParams) {
      forces = next;
    },

    groups() {
      return [];
    },

    crossGroupEdgeIndices() {
      return new Set<number>();
    },
  };
}
