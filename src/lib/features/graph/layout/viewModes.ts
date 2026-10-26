// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Adding a view mode is an entry here plus a LayoutEngine module, never a change to GraphView.
import type { LayoutEngine } from './types';
import { createStandardLayout } from './standardLayout';
import { createClusterLayout } from './clusterLayout';

export type ViewModeId = 'standard' | 'cluster';

export interface ViewMode {
  id: ViewModeId;
  createEngine: () => LayoutEngine;
}

export const VIEW_MODES: Record<ViewModeId, ViewMode> = {
  standard: { id: 'standard', createEngine: createStandardLayout },
  cluster: { id: 'cluster', createEngine: createClusterLayout },
};

// Display order in the mode switch.
export const VIEW_MODE_IDS: ViewModeId[] = ['standard', 'cluster'];

export function isViewModeId(v: unknown): v is ViewModeId {
  return typeof v === 'string' && v in VIEW_MODES;
}
