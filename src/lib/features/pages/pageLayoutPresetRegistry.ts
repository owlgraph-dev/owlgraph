// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The presets the editor's page layout picker offers, set from the editor's load
// before it mounts. Nothing renders from it: a page carries its own copy.
import type { PageLayoutPreset } from './pageLayoutPresets';

let presets: readonly PageLayoutPreset[] = [];

export function setPageLayoutPresets(next: readonly PageLayoutPreset[]): void {
  presets = next;
}

export function getPageLayoutPresets(): readonly PageLayoutPreset[] {
  return presets;
}
