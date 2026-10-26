// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// At overview zoom only the hubs carry a label; zooming in fades the rest in
// (docs/architecture/graph-view.md).
import type { LabelMode } from './settings';

export interface HubOptions {
  fraction: number; // share of nodes to label at overview, by degree rank
  minDegree: number;
  cap: number; // soft cap for very large graphs
}

const DEFAULT_HUB_OPTIONS: HubOptions = { fraction: 0.2, minDegree: 2, cap: 40 };

// Tie-stable: a degree threshold never splits equal-degree nodes. Over the cap
// it rises until it fits, or until only the top degree remains.
export function hubNodeIds(nodes: readonly { id: string; deg: number }[], opts: HubOptions = DEFAULT_HUB_OPTIONS): Set<string> {
  if (nodes.length === 0) return new Set();
  const degrees = nodes.map((n) => n.deg).sort((a, b) => b - a);
  const rank = Math.min(degrees.length, Math.max(1, Math.ceil(opts.fraction * nodes.length)));
  let threshold = Math.max(opts.minDegree, degrees[rank - 1]);
  const maxDeg = degrees[0];
  const countAtOrAbove = (t: number) => degrees.filter((d) => d >= t).length;
  while (countAtOrAbove(threshold) > opts.cap && threshold < maxDeg) threshold++;
  return new Set(nodes.filter((n) => n.deg >= threshold).map((n) => n.id));
}

// Non-hub labels fade in across this scale band, so the easing camera never
// flickers them. It sits above a typical graph's overview fit, so the overview
// shows hubs only; at 1:1 everything shows.
export const LABEL_FADE_START = 0.72;
export const LABEL_FADE_END = 1.0;

export interface LabelContext {
  isHub: boolean;
  scale: number;
  inFocus: boolean; // the focused node or one of its neighbours
  hovered: boolean;
}

export function labelOpacity(mode: LabelMode, ctx: LabelContext): number {
  if (ctx.inFocus || ctx.hovered) return 1;
  if (mode === 'always') return 1;
  if (mode === 'never') return 0;
  if (ctx.isHub) return 1;
  const t = (ctx.scale - LABEL_FADE_START) / (LABEL_FADE_END - LABEL_FADE_START);
  return Math.max(0, Math.min(1, t));
}
