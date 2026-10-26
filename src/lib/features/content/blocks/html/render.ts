// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Sanitized again although the stored html was: a query template may have
// substituted values into it (substitute-then-sanitize, template/templateBinding.ts).
import { attrsOf } from '../../doc/doc';
import type { BlockRenderer } from '../blockRenderer';
import { wrapperHtml } from '../scaffold/blockWrapper';
import { ssrBlock } from '../scaffold/ssrBlock';
import type { HtmlBlockAttrs } from './model';
import { htmlBlockProps, htmlBlockWrapper } from './view';
import HtmlBlock from './HtmlBlock.svelte';

export const renderHtmlBlock: BlockRenderer = (node, ctx) => {
  const a = attrsOf<HtmlBlockAttrs>(node);
  const html = ctx.sanitizeFragment(String(a.html ?? ''));
  return wrapperHtml(htmlBlockWrapper(a), node, ctx, ssrBlock(HtmlBlock, htmlBlockProps(html, null)));
};
