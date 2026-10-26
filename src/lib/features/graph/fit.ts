// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The pan/zoom that frames every node, so the view never starts at, or drifts
// into, a zoom that clips content.
export interface FitTarget {
  x: number;
  y: number;
  r: number;
}

export interface FitTransform {
  scale: number;
  tx: number;
  ty: number;
}

export const FIT_MIN_SCALE = 0.05;
export const FIT_MAX_SCALE = 5;

// World units: labels extend right of the circle and aren't in the bounding box.
const FIT_PADDING = 60;
const FIT_HEADROOM = 0.92;

export function computeFitTransform(nodes: FitTarget[], width: number, height: number): FitTransform {
  if (nodes.length === 0 || width <= 0 || height <= 0) {
    return { scale: 1, tx: 0, ty: 0 };
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.x - n.r);
    maxX = Math.max(maxX, n.x + n.r);
    minY = Math.min(minY, n.y - n.r);
    maxY = Math.max(maxY, n.y + n.r);
  }
  const contentW = maxX - minX + FIT_PADDING * 2;
  const contentH = maxY - minY + FIT_PADDING * 2;
  const rawScale = Math.min(width / contentW, height / contentH) * FIT_HEADROOM;
  const scale = Math.max(FIT_MIN_SCALE, Math.min(FIT_MAX_SCALE, rawScale));
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  return {
    scale,
    tx: width / 2 - centerX * scale,
    ty: height / 2 - centerY * scale,
  };
}
