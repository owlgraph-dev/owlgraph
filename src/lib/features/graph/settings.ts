// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The panel's View, Display and Forces settings. Filters are never remembered:
// a stale class filter would silently hide nodes on the next visit.
import { DEFAULT_FORCES, FORCE_RANGES, type ForceParams } from './layout/forceParams';
import { isViewModeId, type ViewModeId } from './layout/viewModes';

export type LabelMode = 'zoom' | 'always' | 'never';
export type ColorBy = 'type' | 'class' | 'namespace';
export type NodeSize = 'degree' | 'uniform';

export interface GraphSettings {
  mode: ViewModeId;
  labels: LabelMode;
  edgeLabels: boolean;
  colorBy: ColorBy;
  nodeSize: NodeSize;
  forces: ForceParams;
}

export const LABEL_MODES: LabelMode[] = ['zoom', 'always', 'never'];
const COLOR_BY_OPTIONS: ColorBy[] = ['type', 'class', 'namespace'];
export const NODE_SIZES: NodeSize[] = ['degree', 'uniform'];

export const DEFAULT_SETTINGS: GraphSettings = {
  mode: 'standard',
  labels: 'zoom',
  edgeLabels: true,
  colorBy: 'type',
  nodeSize: 'degree',
  forces: DEFAULT_FORCES,
};

const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;

const clampNumber = (v: unknown, key: keyof ForceParams, fallback: number): number => {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  const { min, max } = FORCE_RANGES[key];
  return Math.min(max, Math.max(min, v));
};

// Coerces anything stored into valid settings: invalid values fall back to the
// defaults, forces are clamped to the slider ranges.
export function parseSettings(raw: unknown, defaults: GraphSettings = DEFAULT_SETTINGS): GraphSettings {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const forcesRaw = obj.forces && typeof obj.forces === 'object' ? (obj.forces as Record<string, unknown>) : {};
  return {
    mode: isViewModeId(obj.mode) ? obj.mode : defaults.mode,
    labels: oneOf(obj.labels, LABEL_MODES, defaults.labels),
    edgeLabels: typeof obj.edgeLabels === 'boolean' ? obj.edgeLabels : defaults.edgeLabels,
    colorBy: oneOf(obj.colorBy, COLOR_BY_OPTIONS, defaults.colorBy),
    nodeSize: oneOf(obj.nodeSize, NODE_SIZES, defaults.nodeSize),
    forces: {
      center: clampNumber(forcesRaw.center, 'center', defaults.forces.center),
      repel: clampNumber(forcesRaw.repel, 'repel', defaults.forces.repel),
      link: clampNumber(forcesRaw.link, 'link', defaults.forces.link),
      linkDistance: clampNumber(forcesRaw.linkDistance, 'linkDistance', defaults.forces.linkDistance),
    },
  };
}

// localStorage may be unavailable (SSR, private mode, blocked): both helpers degrade quietly.
export function loadSettings(storageKey: string, defaults: GraphSettings = DEFAULT_SETTINGS): GraphSettings {
  if (typeof localStorage === 'undefined') return defaults;
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? parseSettings(JSON.parse(raw), defaults) : defaults;
  } catch {
    return defaults;
  }
}

export function saveSettings(storageKey: string, settings: GraphSettings): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(storageKey, JSON.stringify(settings));
  } catch {
    // storage full or blocked — the in-memory settings still apply
  }
}
