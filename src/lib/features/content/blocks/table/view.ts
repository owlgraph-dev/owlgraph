// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// A table's attrs as its wrapper and Table.svelte's props, for the
// editor and the page.
import { spaceAboveOverrides } from '../../capabilities/spacing/spacing';
import { mergeOverrides, type OverrideSet } from '../../capabilities/overrides';
import type { ResolvedBlockDefaults } from '../../capabilities/defaults/blockDefaults';
import { groupClass } from '../catalog';
import type { BlockWrapper } from '../scaffold/blockWrapper';
import type { SvelteNodeViewContext } from '../scaffold/svelteNodeView.svelte';
import type { TableAttrs } from './model';
import { columnWidthPercents, tableSpanVar, tableStyle } from './tableStyle';

export type TableEditing = SvelteNodeViewContext['view'];

/**
 * The box a wide table scrolls in (table.css). A hidden header row is dimmed
 * in the editor, where it stays editable; the page leaves it out.
 */
export function tableWrapper(attrs: TableAttrs | undefined): BlockWrapper {
  return {
    classes: ['table-block', groupClass('table'), attrs?.showHeader === false ? 'table-block--header-hidden' : ''].filter(Boolean),
    blockId: attrs?.blockId ?? null,
    overrides: spaceAboveOverrides(attrs),
  };
}

/**
 * `rule` registers an override set with the surface's stylesheet and returns
 * its id. `rowsHtml` is null in the editor, where ProseMirror fills the body;
 * `editing` is null wherever there are no resize handles.
 */
export function tableProps(
  attrs: TableAttrs | undefined,
  cols: number,
  rule: (set: OverrideSet) => string,
  blockDefaults: ResolvedBlockDefaults,
  rowsHtml: string | null,
  editing: TableEditing | null
) {
  const percents = columnWidthPercents(attrs?.columnWidths, cols);
  return {
    tableRuleId: rule(mergeOverrides(tableStyle(attrs, blockDefaults), tableSpanVar(percents))),
    columns: percents.map((p) => rule({ width: `${p}%` })),
    rowsHtml,
    editing,
  };
}
