// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The plugins' editor halves, one line per plugin that adds blocks. Read by the
// editor feature, never by content: the plugins' NodeViews import content's
// editor entry, which re-exports the content block list.
import type { AnyExtension } from '@tiptap/core';
import type { PluginEditor, PluginEditorBlock, PluginEditorContext, PluginInsertItem } from './api';
import { nextcloudEditor } from './nextcloud/editor';

const EDITORS: readonly PluginEditor[] = [nextcloudEditor];

const BLOCKS: ReadonlyMap<string, PluginEditorBlock> = new Map(EDITORS.flatMap((editor) => Object.entries(editor.blocks)));

export function pluginBlockExtensions(ctx: PluginEditorContext): AnyExtension[] {
  return [...BLOCKS.values()].map((block) => block.extension(ctx));
}

/** Undefined for a core kind. */
export function pluginEditorBlock(type: string | null | undefined): PluginEditorBlock | undefined {
  return type ? BLOCKS.get(type) : undefined;
}

/** The Insert menu's integrations group. */
export const PLUGIN_INSERT_ITEMS: readonly (PluginInsertItem & { kind: string })[] = [...BLOCKS].flatMap(([kind, block]) =>
  block.insert ? [{ ...block.insert, kind }] : []
);
