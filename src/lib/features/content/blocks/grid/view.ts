// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// A grid's attrs as Grid.svelte's props, for the editor and the page.
// The wrapper is the block (id, space above, placement, width, bleed); the row
// inside it is the CSS grid (docs/architecture/blocks/anatomy.md, "Containers without chrome").
import type { Component } from 'svelte';
import { spaceAboveOverrides } from '../../capabilities/spacing/spacing';
import { mergeOverrides, type OverrideSet } from '../../capabilities/overrides';
import { placementClass, placementVars } from '../../capabilities/placement/placement';
import type { ResolvedBlockDefaults } from '../../capabilities/defaults/blockDefaults';
import { groupClass } from '../catalog';
import type { BlockWrapper } from '../scaffold/blockWrapper';
import type { SvelteNodeViewContext } from '../scaffold/svelteNodeView.svelte';
import type { GridAttrs } from './model';
import type { CellBox } from './gridMath';
import { gridStyle } from './gridStyle';
import { reflowTiers } from './gridColumns';

export interface GridHandlesProps {
  editing: GridEditing;
  row: HTMLElement;
  /** The grid's block id: the merge selection armed by it is this grid's. */
  blockId: string | null;
  /** The cells' places: a merge or a structural edit moves the handles. */
  cellsKey: string;
  /** The row's rule: a change means the tracks moved without the grid resizing. */
  ruleId: string;
}

/**
 * The editor's side of a grid, the handles' component included. It comes in
 * as a prop so Grid.svelte, which the page loads too, never reaches
 * ProseMirror or the editor's chrome.
 */
export interface GridEditing extends Pick<SvelteNodeViewContext['view'], 'editor' | 'getPos'> {
  handles: Component<GridHandlesProps>;
  merge(box: CellBox): void;
  unmerge(cellIndex: number): void;
  /** The column weights; out of history while a drag moves, into it once on release. */
  setColumnWidths(widths: number[], history: boolean): void;
  setRowHeights(heights: (number | null)[], history: boolean): void;
}

/** The block's width as its wrapper's attribute: none for the reading width. */
export const widthAttr = (width: string | null | undefined) => (width && width !== 'normal' ? String(width) : null);

export function gridWrapper(attrs: GridAttrs | undefined): BlockWrapper {
  return {
    classes: ['grid-block', groupClass('grid'), placementClass(attrs?.placement, 'box')].filter(Boolean),
    blockId: attrs?.blockId ?? null,
    attrs: { 'data-width': widthAttr(attrs?.width), 'data-bleed-top': attrs?.bleedToTop ? '' : null },
    overrides: mergeOverrides(spaceAboveOverrides(attrs), placementVars(attrs?.placement, 'box')),
  };
}

/**
 * `rule` registers an override set with the surface's stylesheet and returns
 * its id. `cellsHtml` is null in the editor, where ProseMirror fills the row;
 * `editing` is null wherever there are no handles.
 */
export function gridRowProps(
  attrs: GridAttrs | undefined,
  rule: (set: OverrideSet) => string,
  blockDefaults: ResolvedBlockDefaults,
  cellsHtml: string | null,
  editing: GridEditing | null = null,
  cellsKey = ''
) {
  return {
    section: false,
    ruleId: rule(gridStyle(attrs, blockDefaults)),
    reflow: reflowTiers(attrs),
    columns: '',
    cellsHtml,
    editing,
    blockId: editing ? (attrs?.blockId ?? null) : null,
    cellsKey,
  };
}
