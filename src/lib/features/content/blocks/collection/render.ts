// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// No island: nothing of it changes on the page. A collection the reader may
// not read renders nothing, not even its box, so it leaves no trace.
import { getLocale } from '$lib/paraglide/runtime';
import { attrsOf } from '../../doc/doc';
import type { BlockRenderer } from '../blockRenderer';
import { wrapperHtml } from '../scaffold/blockWrapper';
import { ssrBlock } from '../scaffold/ssrBlock';
import CollectionBlock from './CollectionBlock.svelte';
import { collectionConfig, type CollectionBlockData } from './model';
import { collectionBlockProps, collectionBlockTexts, collectionBoxOverrides, collectionWrapper } from './view';

export const renderCollectionBlock: BlockRenderer = (node, ctx) => {
  const attrs = attrsOf<Record<string, unknown>>(node);
  if (!collectionConfig(attrs).nodeId) return '';
  const blockId = typeof attrs.blockId === 'string' ? attrs.blockId : '';
  const data = blockId ? (ctx.blockData[blockId] as CollectionBlockData | undefined) : undefined;
  if (data?.state === 'hidden') return '';
  const props = collectionBlockProps(attrs, {
    mode: 'page',
    initial: data,
    source: null,
    texts: collectionBlockTexts(false),
    locale: getLocale(),
    ruleId: ctx.styles.add(collectionBoxOverrides(attrs, ctx.registry, ctx.blockDefaults)),
  });
  return wrapperHtml(collectionWrapper(attrs), node, ctx, ssrBlock(CollectionBlock, props));
};
