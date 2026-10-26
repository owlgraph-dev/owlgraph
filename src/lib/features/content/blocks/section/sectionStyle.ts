// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { blockSpaceVars, padVars } from '../../capabilities/spacing/spacing';
import { surfaceVars } from '../../capabilities/surface/surface';
import { surfaceImageVars } from '../../capabilities/surface/surfaceImage';
import { heightVars } from '../../capabilities/height/height';
import { BUILTIN_BLOCK_DEFAULTS, defaultsFor, type ResolvedBlockDefaults } from '../../capabilities/defaults/blockDefaults';
import { mergeOverrides, type OverrideSet } from '../../capabilities/overrides';
import type { SectionAttrs } from './model';

/**
 * A grid container's set less the tracks and gap, which come from the page's
 * column template (grid.css).
 */
export function sectionStyle(attrs: SectionAttrs | undefined, blockDefaults: ResolvedBlockDefaults = BUILTIN_BLOCK_DEFAULTS): OverrideSet {
  const defaults = defaultsFor('pageSection', blockDefaults);
  return mergeOverrides(padVars(attrs?.spacing, defaults.pad), blockSpaceVars(attrs?.spacing, defaults.blockSpace, 'flow-space'), surfaceVars(attrs?.surface, defaults, 'surface'), surfaceImageVars(attrs?.surface), heightVars(attrs?.height));
}
