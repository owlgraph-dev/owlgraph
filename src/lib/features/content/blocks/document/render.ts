// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// No island: its links are plain links. A document the reader may not read
// renders nothing, not even its box, so it leaves no trace.
import { getLocale } from '$lib/paraglide/runtime';
import { attrsOf } from '../../doc/doc';
import type { BlockRenderer } from '../blockRenderer';
import { wrapperHtml } from '../scaffold/blockWrapper';
import { ssrBlock } from '../scaffold/ssrBlock';
import DocumentBlock from './DocumentBlock.svelte';
import { documentConfig, type DocumentBlockData } from './model';
import { documentBlockProps, documentBlockTexts, documentBoxOverrides, documentWrapper } from './view';

export const renderDocumentBlock: BlockRenderer = (node, ctx) => {
  const attrs = attrsOf<Record<string, unknown>>(node);
  if (!documentConfig(attrs).nodeId) return '';
  const blockId = typeof attrs.blockId === 'string' ? attrs.blockId : '';
  const data = blockId ? (ctx.blockData[blockId] as DocumentBlockData | undefined) : undefined;
  if (data?.state === 'hidden') return '';
  const props = documentBlockProps(attrs, {
    mode: 'page',
    initial: data,
    source: null,
    texts: documentBlockTexts(false),
    locale: getLocale(),
    ruleId: ctx.styles.add(documentBoxOverrides(attrs, ctx.registry, ctx.blockDefaults)),
  });
  return wrapperHtml(documentWrapper(attrs), node, ctx, ssrBlock(DocumentBlock, props));
};
