// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// A view mode is a layout engine behind this interface, so a new mode is a new
// engine, not a change to GraphView.
import type { GraphNode, GraphEdge } from '../types';
import type { ForceParams } from './forceParams';

export interface Point {
  x: number;
  y: number;
}

export interface Viewport {
  w: number;
  h: number;
}

export interface LayoutEngine {
  // `seed`: starting world positions, so a filter or mode change nudges rather than re-scatters.
  init(nodes: GraphNode[], edges: GraphEdge[], viewport: Viewport, seed?: Map<string, Point>): void;
  // For a mode that places things relative to the viewport; neither engine does.
  setViewport(w: number, h: number): void;
  // Returns false once nothing moves.
  step(): boolean;
  positions(): Map<string, Point>;
  // A pinned node snaps to its pin every frame until unpinned.
  pin(id: string, x: number, y: number): void;
  unpin(id: string): void;
  unpinAll(): void;
  reheat(alpha: number): void;
  setForces(forces: ForceParams): void;
  // Member lists, one per group; empty for an engine without grouping.
  groups(): string[][];
  // Edges whose ends lie in different groups.
  crossGroupEdgeIndices(): Set<number>;
}
