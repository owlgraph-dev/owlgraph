// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The file block's page render: the editor's component, server-only (nothing
// hydrates), from what was resolved for the viewer (RenderContext.blockData).
// Nothing resolved (an agent's view) renders the neutral placeholder.
import { attrsOf, wrapperHtml, type BlockRenderer } from '$lib/features/content';
import { currentLocale } from '$lib/plugins/api';
import FileCard from './FileCard.svelte';
import type { FileBlockData } from './blockData.server';
import { fileTexts } from './texts';
import { fileBoxOverrides, fileProps, fileWrapper } from './view';

export const renderFileBlock: BlockRenderer = (node, ctx) => {
  const attrs = attrsOf<Record<string, unknown>>(node);
  const blockId = typeof attrs.blockId === 'string' ? attrs.blockId : '';
  const data = blockId ? (ctx.blockData[blockId] as FileBlockData | undefined) : undefined;
  const props = fileProps(attrs, {
    mode: 'page',
    initial: data ? data.view : undefined,
    texts: fileTexts(false),
    locale: currentLocale(),
    ruleId: ctx.styles.add(fileBoxOverrides(attrs, ctx.registry, ctx.blockDefaults)),
    editing: null,
  });
  return wrapperHtml(fileWrapper(attrs), node, ctx, ctx.ssr(FileCard, props));
};
