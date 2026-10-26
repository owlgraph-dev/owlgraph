// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// A flex row's attrs as FlexRow.svelte's props, for the editor and the page.
// The wrapper is the block (id, space above, placement, width, bleed); the row
// inside it is the flex box (docs/architecture/blocks/anatomy.md, "Containers without chrome").
import { spaceAboveOverrides } from '../../capabilities/spacing/spacing';
import { mergeOverrides, type OverrideSet } from '../../capabilities/overrides';
import { placementClass, placementVars } from '../../capabilities/placement/placement';
import { columnTiers, scrollTiers } from '../../capabilities/layout/layout';
import type { ResolvedBlockDefaults } from '../../capabilities/defaults/blockDefaults';
import { groupClass } from '../catalog';
import type { BlockWrapper } from '../scaffold/blockWrapper';
import type { FlexContainerAttrs } from './model';
import { flexRowStyle } from './flexStyle';

/**
 * Carries the group class too: the theme's rhythm default for containers keys
 * on the block (capabilities/defaults/emitDefaults.ts).
 */
export function flexWrapper(attrs: FlexContainerAttrs | undefined): BlockWrapper {
  const width = attrs?.width && attrs.width !== 'normal' ? String(attrs.width) : null;
  return {
    classes: ['flex-block', groupClass('flexContainer'), placementClass(attrs?.placement, 'box')].filter(Boolean),
    blockId: attrs?.blockId ?? null,
    attrs: { 'data-width': width, 'data-bleed-top': attrs?.bleedToTop ? '' : null },
    overrides: mergeOverrides(spaceAboveOverrides(attrs), placementVars(attrs?.placement, 'box')),
  };
}

/**
 * `rule` registers an override set with the surface's stylesheet and returns
 * its id. `cellsHtml` is null in the editor, where ProseMirror fills the row.
 */
export function flexRowProps(
  attrs: FlexContainerAttrs | undefined,
  rule: (set: OverrideSet) => string,
  blockDefaults: ResolvedBlockDefaults,
  cellsHtml: string | null
) {
  return {
    ruleId: rule(flexRowStyle(attrs, blockDefaults)),
    column: columnTiers(attrs?.layout),
    scroll: scrollTiers(attrs?.layout),
    cellsHtml,
  };
}
