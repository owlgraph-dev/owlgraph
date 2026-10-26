// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The grid's page render, also the page section's and a query
// template's. No island: a grid has no behaviour on the page.
import { cellStyle } from './gridStyle';
import type { GridCellAttrs, GridAttrs } from './model';
import { EMPTY_TYPOGRAPHY_REGISTRY, type TypographyRegistry } from '../../capabilities/typography/roles';
import { BUILTIN_BLOCK_DEFAULTS, type ResolvedBlockDefaults } from '../../capabilities/defaults/blockDefaults';
import { attrsOf } from '../../doc/doc';
import { renderChildren, overrideAttribute, type BlockRenderer } from '../blockRenderer';
import type { StyleCollector } from '../../capabilities/pageStyles';
import { groupClass } from '../catalog';
import { wrapperHtml } from '../scaffold/blockWrapper';
import { ssrBlock } from '../scaffold/ssrBlock';
import { gridRowProps, gridWrapper } from './view';
import Grid from './Grid.svelte';

function renderGridCell(
  attrs: GridCellAttrs | undefined,
  childrenHtml: string,
  styles: StyleCollector,
  registry: TypographyRegistry = EMPTY_TYPOGRAPHY_REGISTRY,
  schemeAttrs = '',
  blockDefaults: ResolvedBlockDefaults = BUILTIN_BLOCK_DEFAULTS
): string {
  const style = overrideAttribute({ styles }, cellStyle(attrs, registry, blockDefaults));
  const stretchAttr = attrs?.stretch ? ' data-stretch=""' : '';
  return `<div class="grid-cell ${groupClass('gridCell')} cap-spacing cap-surface cap-typography"${stretchAttr}${schemeAttrs}${style}>${childrenHtml}</div>`;
}

export const renderGridBlock: BlockRenderer = (node, ctx) => {
  const a = attrsOf<GridAttrs>(node);
  const props = gridRowProps(a, (set) => ctx.styles.add(set), ctx.blockDefaults, renderChildren(node, ctx));
  return wrapperHtml(gridWrapper(a), node, ctx, ssrBlock(Grid, props));
};

export const renderGridCellBlock: BlockRenderer = (node, ctx) =>
  renderGridCell(attrsOf<GridCellAttrs>(node), renderChildren(node, ctx), ctx.styles, ctx.registry, ctx.schemeAttributes(node), ctx.blockDefaults);
