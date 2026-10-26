// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The image block's page render. No island: an image has no page behaviour.
import { attrsOf } from '../../doc/doc';
import type { BlockRenderer } from '../blockRenderer';
import { wrapperHtml } from '../scaffold/blockWrapper';
import { ssrBlock } from '../scaffold/ssrBlock';
import type { ImageAttrs } from './model';
import { imageProps, imageWrapper } from './view';
import PageImage from './PageImage.svelte';

export const renderImage: BlockRenderer = (node, ctx) => {
  const a = attrsOf<ImageAttrs>(node);
  const id = a.assetId ? String(a.assetId) : '';
  if (!id) return '';
  const props = imageProps(a, ctx.assetSize(id), (set) => ctx.styles.add(set), ctx.isLeadImage(node), null);
  return wrapperHtml(imageWrapper(a), node, ctx, ssrBlock(PageImage, props));
};
