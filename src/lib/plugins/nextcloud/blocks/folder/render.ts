// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The folder block's page render: the editor's component as an island, from what
// was resolved for the viewer (RenderContext.blockData); nothing resolved (an
// agent's view) renders `loading`. A collection the viewer may not read gets the
// neutral line and no island, whose props would carry the block's settings.
import { attrsOf, wrapperHtml, type BlockRenderer } from '$lib/features/content';
import { currentLocale } from '$lib/plugins/api';
import FolderListing from './FolderListing.svelte';
import type { FolderBlockData } from './blockData.server';
import { PLUGIN_ROUTES } from '../routes';
import { FOLDER_ISLAND } from './model';
import { folderTexts } from './texts';
import { folderBoxOverrides, folderProps, folderWrapper } from './view';

export const renderFolderBlock: BlockRenderer = (node, ctx) => {
  const attrs = attrsOf<Record<string, unknown>>(node);
  const blockId = typeof attrs.blockId === 'string' ? attrs.blockId : '';
  const data = blockId ? (ctx.blockData[blockId] as FolderBlockData | undefined) : undefined;
  const props = folderProps(attrs, {
    mode: 'page',
    initial: data ? data.view : undefined,
    texts: folderTexts(false),
    locale: currentLocale(),
    renderedAt: Date.now(),
    ruleId: ctx.styles.add(folderBoxOverrides(attrs, ctx.registry, ctx.blockDefaults)),
    base: PLUGIN_ROUTES,
    editing: null,
  });
  if (data && data.view === null) {
    const neutral = { ...props, config: { ...props.config, startPath: '' } };
    return wrapperHtml(folderWrapper(attrs), node, ctx, ctx.ssr(FolderListing, neutral));
  }
  return wrapperHtml({ ...folderWrapper(attrs), island: { kind: FOLDER_ISLAND, props } }, node, ctx, ctx.ssr(FolderListing, props));
};
