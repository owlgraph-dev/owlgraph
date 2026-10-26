// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The flex row's page render. No island: a row has no page behaviour.
import { attrsOf } from '../../doc/doc';
import { renderChildren, overrideAttribute, type BlockRenderer } from '../blockRenderer';
import { groupClass } from '../catalog';
import { flexItemClass } from '../../capabilities/flexItem/flexItem';
import { wrapperHtml } from '../scaffold/blockWrapper';
import { ssrBlock } from '../scaffold/ssrBlock';
import type { FlexCellAttrs, FlexContainerAttrs } from './model';
import { flexCellStyle } from './flexStyle';
import { flexRowProps, flexWrapper } from './view';
import FlexRow from './FlexRow.svelte';

export const renderFlexContainerBlock: BlockRenderer = (node, ctx) => {
  const a = attrsOf<FlexContainerAttrs>(node);
  const props = flexRowProps(a, (set) => ctx.styles.add(set), ctx.blockDefaults, renderChildren(node, ctx));
  return wrapperHtml(flexWrapper(a), node, ctx, ssrBlock(FlexRow, props));
};

export const renderFlexCellBlock: BlockRenderer = (node, ctx) => {
  const a = attrsOf<FlexCellAttrs>(node);
  const style = overrideAttribute(ctx, flexCellStyle(a, ctx.registry, ctx.blockDefaults));
  const sized = flexItemClass(a.flexItem);
  return `<div class="flex-cell ${groupClass('flexCell')} cap-spacing cap-surface cap-typography${sized ? ` ${sized}` : ''}"${ctx.schemeAttributes(node)}${style}>${renderChildren(node, ctx)}</div>`;
};
