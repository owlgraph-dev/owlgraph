// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { attrsOf } from '../../doc/doc';
import { listOverrides, type ListAttrs } from './listStyle';
import { blockIdAttribute, renderChildren, overrideAttribute, type BlockRenderer } from '../blockRenderer';

export const renderBulletList: BlockRenderer = (node, ctx) =>
  `<ul${blockIdAttribute(node)}${overrideAttribute(ctx, listOverrides('bulletList', attrsOf<ListAttrs>(node)))}>${renderChildren(node, ctx)}</ul>`;

export const renderOrderedList: BlockRenderer = (node, ctx) =>
  `<ol${blockIdAttribute(node)}${overrideAttribute(ctx, listOverrides('orderedList', attrsOf<ListAttrs>(node)))}>${renderChildren(node, ctx)}</ol>`;

// An item is addressable (catalog.ts) but takes no block spacing: items keep
// the list's --list-gap, which is why the owl rule excludes `li`.
export const renderListItem: BlockRenderer = (node, ctx) =>
  `<li${blockIdAttribute(node)}>${renderChildren(node, ctx)}</li>`;
