// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Which block settings sections a target gets, free of Svelte and Tiptap:
// capability support comes in as a predicate, not from an editor.
import { queryFormat, FLOW_BLOCK_TYPES, SPACED_BLOCK_TYPES } from '$lib/features/content';
import { PAGE_TYPE } from '$lib/features/content/editor';
import { surfaceFieldsOf } from '../blocks/catalog';

export type CapabilitySectionId = 'layout' | 'placement' | 'spacing' | 'surface' | 'alignment' | 'flexItem';
export type EmptyKind = 'none' | 'toolbar' | 'no-settings';

// A Layout section whatever the capabilities: width and bleed-to-top are node
// attrs, not capability data.
const LAYOUT_SECTION_TYPES = new Set(['grid', 'flexContainer', 'queryBlock']);
// Formatted from the toolbar, a heading's level included (the paragraph
// style); a placeholder becomes a paragraph the moment one types.
const TOOLBAR_FORMATTED_TYPES = new Set(['paragraph', 'heading', 'listItem', 'placeholder']);

// A flow (something blocks sit in) earns a rhythm, a block in a flow a space
// above, and padding is its own capability. The page is only a flow; a cell
// is a flow but never a spacing target, its gaps being its container's.
const isFlow = (type: string) => type === PAGE_TYPE || FLOW_BLOCK_TYPES.has(type);
const isSpaceAboveTarget = (type: string) => type !== PAGE_TYPE && SPACED_BLOCK_TYPES.has(type);

export interface SpacingRows {
  blockSpace: boolean;
  spaceAbove: boolean;
  pad: boolean;
}

// The query block's capabilities sit on its result format's container, not
// the node: ask through here or its rows silently go missing. Placement, like
// its width, stays a node concern.
export function capabilitySupport(
  supports: (capability: string) => boolean,
  type: string,
  attrs: Record<string, unknown>
): (capability: string) => boolean {
  return (cap: string) =>
    type === 'queryBlock' ? cap === 'placement' || (queryFormat(attrs.format).capabilities as string[]).includes(cap) : supports(cap);
}

/**
 * The placement section's rows: the moves where the block sits directly in a
 * page section's cell (`movable`), the alignment where it supports Placement
 * and isn't a full-width band, which has no column to sit in.
 */
export function placementRowsFor(
  supports: (capability: string) => boolean,
  type: string,
  attrs: Record<string, unknown>,
  movable: boolean
): { moves: boolean; align: boolean } {
  const align = type !== PAGE_TYPE && capabilitySupport(supports, type, attrs)('placement') && attrs.width !== 'full';
  return { moves: movable, align };
}

export function spacingRowsFor(supports: (capability: string) => boolean, type: string): SpacingRows {
  return {
    blockSpace: isFlow(type),
    spaceAbove: isSpaceAboveTarget(type),
    pad: type !== PAGE_TYPE && supports('spacing'),
  };
}

export function capabilitySectionsFor(
  supports: (capability: string) => boolean,
  type: string,
  attrs: Record<string, unknown>,
  movable = false
): CapabilitySectionId[] {
  // A block's section ids, so each folds together with its block
  // counterpart; the rows are the page's own.
  if (type === PAGE_TYPE) return ['layout', 'spacing', 'surface'];
  const has = capabilitySupport(supports, type, attrs);
  const out: CapabilitySectionId[] = [];
  if (LAYOUT_SECTION_TYPES.has(type)) out.push('layout');
  const placement = placementRowsFor(supports, type, attrs, movable);
  if (placement.moves || placement.align) out.push('placement');
  // Any of the three rows earns the section: a paragraph has no padding but
  // a space above it.
  const spacing = spacingRowsFor(has, type);
  if (spacing.blockSpace || spacing.spaceAbove || spacing.pad) out.push('spacing');
  // A plain quick link offers no Surface fields.
  if (has('surface') && surfaceFieldsOf(type, attrs).length > 0) out.push('surface');
  if (type === 'gridCell') out.push('alignment');
  if (type === 'flexCell' && has('flexItem')) out.push('flexItem');
  return out;
}

// What the block settings panel says for a target with no sections; a text block's says
// its formatting comes from the toolbar.
export function emptyKindFor(type: string): EmptyKind {
  return TOOLBAR_FORMATTED_TYPES.has(type) ? 'toolbar' : 'no-settings';
}

// The breadcrumb shows the last two levels; the rest collapses into a leading
// "…" menu so the path never wraps.
export function splitCrumbs<T>(path: T[]): { hidden: T[]; visible: T[] } {
  if (path.length <= 2) return { hidden: [], visible: path };
  return { hidden: path.slice(0, -2), visible: path.slice(-2) };
}
