// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The table's page render. Every row goes in one <tbody>, as in the
// editor: table.css's corner selectors need one parent for all rows, and
// <th scope="col"> carries the header semantics a <thead> would.
import { attrsOf, type JsonNode } from '../../doc/doc';
import { renderChildren, overrideAttribute, type BlockRenderer } from '../blockRenderer';
import { groupClass } from '../catalog';
import { wrapperHtml } from '../scaffold/blockWrapper';
import { ssrBlock } from '../scaffold/ssrBlock';
import type { TableAttrs, TableCellAttrs, TableRowAttrs } from './model';
import { cellStyle, rowStyle } from './tableStyle';
import { tableProps, tableWrapper } from './view';
import Table from './Table.svelte';

export const renderTable: BlockRenderer = (node, ctx) => {
  const a = attrsOf<TableAttrs>(node);
  const allRows: JsonNode[] = node.content ?? [];
  const cols = allRows[0]?.content?.length ?? 1;
  // Row 0 is always the header row (model.ts).
  const rows = a.showHeader !== false ? allRows : allRows.slice(1);
  const props = tableProps(a, cols, (set) => ctx.styles.add(set), ctx.blockDefaults, rows.map(ctx.renderNode).join(''), null);
  return wrapperHtml(tableWrapper(a), node, ctx, ssrBlock(Table, props));
};

export const renderTableRow: BlockRenderer = (node, ctx) =>
  `<tr${overrideAttribute(ctx, rowStyle(attrsOf<TableRowAttrs>(node)))}>${renderChildren(node, ctx)}</tr>`;

export const renderTableCell: BlockRenderer = (node, ctx) => {
  const a = attrsOf<TableCellAttrs>(node);
  const tag = a.isHeader ? 'th' : 'td';
  const style = overrideAttribute(ctx, cellStyle(a, ctx.blockDefaults));
  const scope = a.isHeader ? ' scope="col"' : '';
  return `<${tag} class="${groupClass('tableCell')} cap-spacing cap-surface"${scope}${ctx.schemeAttributes(node)}${style}>${ctx.renderInline(node.content)}</${tag}>`;
};
