// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The flex row's and its cells' style emitters, shared by the editor and the
// page. The block's space above and placement are the wrapper's (view.ts).
import { layoutVars } from '../../capabilities/layout/layout';
import { blockSpaceVars, flowRhythmVars, padVars } from '../../capabilities/spacing/spacing';
import { surfaceVars } from '../../capabilities/surface/surface';
import { surfaceImageVars } from '../../capabilities/surface/surfaceImage';
import { heightVars } from '../../capabilities/height/height';
import { typographyVars } from '../../capabilities/typography/typography';
import { EMPTY_TYPOGRAPHY_REGISTRY, type TypographyRegistry } from '../../capabilities/typography/roles';
import { bodyDefaults } from '../../capabilities/typography/paragraphStyles';
import { BUILTIN_BLOCK_DEFAULTS, defaultsFor, type ResolvedBlockDefaults } from '../../capabilities/defaults/blockDefaults';
import { mergeOverrides, type OverrideSet } from '../../capabilities/overrides';
import { flexItemVars } from '../../capabilities/flexItem/flexItem';
import type { FlexCellAttrs, FlexContainerAttrs } from './model';

export function flexRowStyle(attrs: FlexContainerAttrs | undefined, blockDefaults: ResolvedBlockDefaults = BUILTIN_BLOCK_DEFAULTS): OverrideSet {
  const defaults = defaultsFor('flexContainer', blockDefaults);
  return mergeOverrides(
    layoutVars(attrs?.layout),
    padVars(attrs?.spacing, defaults.pad),
    // --flow-space-*: --block-space-* here would feed the row's own margin.
    blockSpaceVars(attrs?.spacing, defaults.blockSpace, 'flow-space'),
    surfaceVars(attrs?.surface, defaults, 'surface'),
    surfaceImageVars(attrs?.surface),
    heightVars(attrs?.height)
  );
}

export function flexCellStyle(
  attrs: FlexCellAttrs | undefined,
  registry: TypographyRegistry = EMPTY_TYPOGRAPHY_REGISTRY,
  blockDefaults: ResolvedBlockDefaults = BUILTIN_BLOCK_DEFAULTS
): OverrideSet {
  const defaults = defaultsFor('flexCell', blockDefaults);
  return mergeOverrides(
    // Always the default paragraph style's look, a theme stylesheet rule, so
    // only a deviation is emitted.
    typographyVars(attrs?.typography, bodyDefaults(registry), 'typography', registry),
    padVars(attrs?.spacing, defaults.pad),
    // A cell is a flow but not a spacing target, so it publishes both names (spacing.ts).
    flowRhythmVars(attrs?.spacing, defaults.blockSpace),
    surfaceVars(attrs?.surface, defaults, 'surface'),
    surfaceImageVars(attrs?.surface),
    flexItemVars(attrs?.flexItem)
  );
}
