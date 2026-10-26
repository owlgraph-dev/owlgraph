// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The four user-facing forces, in Obsidian's vocabulary. The cluster engine's
// community forces are ratios of these.
export interface ForceParams {
  center: number; // integrate() centerStrength
  repel: number; // applyRepulsion() strength
  link: number; // applySprings() strength
  linkDistance: number; // ideal spacing / spring rest length (k)
}

// Tuned so Standard looks right untouched: a core wide enough to read its
// edges, orphans in a compact halo.
export const DEFAULT_FORCES: ForceParams = {
  center: 0.0008,
  repel: 0.035,
  link: 0.015,
  linkDistance: 200,
};

export interface ForceRange {
  min: number;
  max: number;
  step: number;
}

// The extremes still give a usable layout.
export const FORCE_RANGES: Record<keyof ForceParams, ForceRange> = {
  center: { min: 0, max: 0.003, step: 0.0001 },
  repel: { min: 0.005, max: 0.1, step: 0.005 },
  link: { min: 0.002, max: 0.05, step: 0.001 },
  linkDistance: { min: 40, max: 400, step: 10 },
};
