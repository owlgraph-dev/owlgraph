// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The selection entry a settings section edits, and the path its writes take
// back into the document. A block writes by id; a structural cell, a container
// or a list by chain position; the page through the doc-attr step.
import { PAGE_TYPE, type SelectionChainEntry } from '$lib/features/content/editor';
import { embedKindOf } from '$lib/features/content';
import type { Target } from './types';

type Ctx = { attrs: Record<string, any> } | null;
type Selected = { id: string; type: string; attrs: Record<string, any> } | null;

/** What the selection offers a target: its chain, the pointer into it, the block selected and the contexts around the caret. */
export interface TargetSelection {
  chain: SelectionChainEntry[];
  index: number;
  selected: Selected;
  cell: Ctx;
  container: Ctx;
  list: Ctx;
  tableCell: Ctx;
}

/** Where each kind of target writes. */
export interface TargetWrites {
  /** An attr on the doc's root node: the page's own settings. */
  pageAttr: (attr: string, value: unknown) => void;
  /** An attr of the selected block, by its id. */
  selectedAttr: (attr: string, value: unknown) => void;
  cell: (patch: Record<string, unknown>) => void;
  tableCell: (patch: Record<string, unknown>) => void;
  container: (patch: Record<string, unknown>) => void;
  list: (patch: Record<string, unknown>) => void;
}

/**
 * Sections follow the entity explicitly selected, never an ancestor of it:
 * select the cell itself to see the cell's sections.
 */
export function blockSettingsTarget(sel: TargetSelection, writes: TargetWrites): Target | null {
  const { chain, index: selectedIndex, selected, cell: cellCtx, container: containerCtx, list: listCtx, tableCell: tableCellCtx } = sel;
  const t = chain[selectedIndex]?.type ?? null;
  // The page is the chain's root; its attrs live on the doc node, so they
  // are written with the doc-attr step rather than by position.
  if (t === PAGE_TYPE) {
    return {
      type: t,
      id: null,
      attrs: chain[selectedIndex]?.attrs ?? {},
      update: (p) => { for (const [k, v] of Object.entries(p)) writes.pageAttr(k, v); },
    };
  }
  if ((t === 'gridCell' || t === 'flexCell') && cellCtx) {
    return { type: t, id: null, attrs: cellCtx.attrs, update: (p) => writes.cell(p) };
  }
  if (t === 'tableCell' && tableCellCtx) {
    return { type: t, id: null, attrs: tableCellCtx.attrs, update: (p) => writes.tableCell(p) };
  }
  if ((t === 'grid' || t === 'flexContainer') && containerCtx) {
    return { type: t, id: chain[selectedIndex]?.id ?? null, attrs: containerCtx.attrs, update: (p) => writes.container(p) };
  }
  if ((t === 'bulletList' || t === 'orderedList') && listCtx) {
    return { type: t, id: chain[selectedIndex]?.id ?? null, attrs: listCtx.attrs, update: (p) => writes.list(p) };
  }
  if (selected) {
    return {
      type: selected.type,
      id: selected.id,
      attrs: selected.attrs,
      update: (p) => { for (const [k, v] of Object.entries(p)) writes.selectedAttr(k, v); },
    };
  }
  return null;
}

/** An embed block's settings on the phone: the selected block, if it shows a node. */
export function embedTarget(selected: Selected, selectedAttr: (attr: string, value: unknown) => void): Target | null {
  if (!selected || !embedKindOf(selected.type)) return null;
  return {
    type: selected.type,
    id: selected.id,
    attrs: selected.attrs,
    update: (patch) => { for (const [k, v] of Object.entries(patch)) selectedAttr(k, v); },
  };
}
