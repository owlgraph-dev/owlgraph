// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The page section's page render: the grid's markup, its tracks and gap the
// page's column template (grid.css).
import { attrsOf } from '../../doc/doc';
import { renderChildren, type BlockRenderer } from '../blockRenderer';
import { wrapperHtml } from '../scaffold/blockWrapper';
import { ssrBlock } from '../scaffold/ssrBlock';
import Grid from '../grid/Grid.svelte';
import type { SectionAttrs } from './model';
import { sectionRowProps, sectionWrapper } from './view';

export const renderPageSectionBlock: BlockRenderer = (node, ctx) => {
  const a = attrsOf<SectionAttrs>(node);
  const props = sectionRowProps(a, (set) => ctx.styles.add(set), ctx.blockDefaults, renderChildren(node, ctx));
  return wrapperHtml(sectionWrapper(a), node, ctx, ssrBlock(Grid, props));
};
