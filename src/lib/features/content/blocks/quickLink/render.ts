// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The editor's component, rendered to a string as an island the page hydrates.
import { attrsOf } from '../../doc/doc';
import type { BlockRenderer } from '../blockRenderer';
import { wrapperHtml } from '../scaffold/blockWrapper';
import { ssrBlock } from '../scaffold/ssrBlock';
import { quickLinkTarget, type QuickLinkAttrs } from './model';
import { quickLinkCardOverrides, quickLinkCardProps, quickLinkWrapper } from './view';
import QuickLinkCard from './QuickLinkCard.svelte';

export const renderQuickLinkBlock: BlockRenderer = (node, ctx) => {
  const a = attrsOf<QuickLinkAttrs>(node);
  const { href, external } = quickLinkTarget(a, (id, slug) => ctx.nodeHref(id, slug));
  // The card element's rule id is one of its props, so the hydrated tree
  // carries the same data-b the server rendered.
  const props = quickLinkCardProps(a, href, external, true, ctx.styles.add(quickLinkCardOverrides(a, ctx.registry, ctx.blockDefaults)));
  return wrapperHtml({ ...quickLinkWrapper(a), island: { kind: 'quickLink', props } }, node, ctx, ssrBlock(QuickLinkCard, props));
};
