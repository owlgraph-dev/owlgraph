// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The editor's facts per block kind beyond its content model; a kind without
// a row is a box with all four Surface fields and no Edit action. Pure (no
// Svelte, no Tiptap) so the block settings panel's logic stays unit-testable
// (docs/architecture/blocks/anatomy.md).
import { pluginEditorBlock } from '$lib/plugins/editor';
import {
  QUICK_LINK_VARIANT_FIELDS,
  quickLinkDefaults,
  quickLinkVariant,
  templateResultDefaults,
  type DefaultValues,
  type PlacementKind,
  type ResolvedBlockDefaults,
  type SurfaceBoxField,
} from '$lib/features/content';

type Attrs = Record<string, unknown>;

export interface EditorBlockKind {
  /** How the Placement capability's control places it (placement.ts); default 'box'. */
  placement?: PlacementKind;
  /** The Surface fields the block settings panel offers; none means no Surface section. Default: all four. */
  surfaceFields?: (attrs: Attrs) => readonly SurfaceBoxField[];
  /** What its Auto rows show: its own defaults, given its group's. Default: the group's. */
  defaults?: (attrs: Attrs, own: DefaultValues, blockDefaults: ResolvedBlockDefaults) => DefaultValues;
  /** Whether the canvas's block tools offer Edit (the block's edit dialog). */
  editable?: (attrs: Attrs) => boolean;
}

const ALL_SURFACE_FIELDS: readonly SurfaceBoxField[] = ['bg', 'border', 'radius', 'shadow'];

export const EDITOR_BLOCKS: Readonly<Record<string, EditorBlockKind>> = {
  // Edit opens the relationship dialog, which only a node target has.
  quickLink: {
    placement: 'card',
    surfaceFields: (attrs) => (quickLinkVariant(attrs) === 'link' ? [] : QUICK_LINK_VARIANT_FIELDS[quickLinkVariant(attrs)]),
    defaults: (attrs, own) => ({ ...own, ...quickLinkDefaults(quickLinkVariant(attrs), own) }),
    editable: (attrs) => attrs.refType !== 'url',
  },
  image: { placement: 'image' },
  // A table's own border is its cells'; a cell sets only its fill.
  table: { surfaceFields: () => ['bg', 'radius', 'shadow'] },
  tableCell: { surfaceFields: () => ['bg'] },
  htmlBlock: { editable: () => true },
  diagram: { editable: () => true },
  // Its capabilities are its result container's, with that container's kind pins.
  queryBlock: { editable: () => true, defaults: (_attrs, _own, blockDefaults) => templateResultDefaults(blockDefaults) },
};

export function editorBlock(type: string | null | undefined): EditorBlockKind | undefined {
  return type && Object.prototype.hasOwnProperty.call(EDITOR_BLOCKS, type) ? EDITOR_BLOCKS[type] : pluginEditorBlock(type);
}

export function placementKindOf(type: string): PlacementKind {
  return editorBlock(type)?.placement ?? 'box';
}

export function surfaceFieldsOf(type: string, attrs: Attrs): readonly SurfaceBoxField[] {
  return editorBlock(type)?.surfaceFields?.(attrs) ?? ALL_SURFACE_FIELDS;
}

export function blockDefaultsOf(type: string, attrs: Attrs, own: DefaultValues, blockDefaults: ResolvedBlockDefaults): DefaultValues {
  return editorBlock(type)?.defaults?.(attrs, own, blockDefaults) ?? own;
}

export function blockIsEditable(type: string | null | undefined, attrs: Attrs): boolean {
  return editorBlock(type)?.editable?.(attrs) ?? false;
}
