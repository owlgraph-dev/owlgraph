// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// A node an integration keeps is shown by the integration's kind, so picking
// it turns the block into that kind, while the integration is on
// (docs/architecture/blocks/node-embeds.md, "One family in the editor").
import type { Editor } from '@tiptap/core';
import { embedKindFor, type EmbedDispatch, type EmbedFamily } from '$lib/features/content';
import { replaceBlockKind } from '$lib/features/content/editor';
import type { NodeSearchResult } from '$lib/features/search';
import type { NodeMark, NodePickerCreate } from '$lib/features/search/picker';
import { pluginEditorBlock } from '$lib/plugins/editor';
import * as m from '$lib/paraglide/messages';
import { labelFor } from '../blockSettings/blockLabels';
import type { BlockSettingsActions, Target } from '../blockSettings/types';

const NONE: EmbedDispatch = { ok: false, reason: 'none' };

// The Insert menu's name says whose block it is; the breadcrumb's is the fallback.
const kindName = (kind: string) => (pluginEditorBlock(kind)?.insert?.label ?? (() => labelFor(kind)))();

const dispatch = (family: EmbedFamily, source: string, actions: BlockSettingsActions): EmbedDispatch =>
  actions.embedKindFor?.(family, source) ?? NONE;

/** Why no kind shows a source's nodes here, in a sentence naming it. */
export function embedUnavailable(reason: 'off' | 'none', source: string): string {
  return reason === 'off' ? m.editor_embed_source_off({ source }) : m.editor_embed_source_none({ source });
}

/** What a node's row says beside it in the picker: why it cannot be picked here, or that the block shows it now — or null. */
export function embedMark(family: EmbedFamily, node: NodeSearchResult, actions: BlockSettingsActions, shown: string | null): NodeMark | null {
  if (node.plugin) {
    const to = dispatch(family, node.plugin, actions);
    if (!to.ok) return { note: embedUnavailable(to.reason, node.pluginLabel ?? node.plugin), disabled: true };
  }
  return node.id === shown ? { note: m.editor_embed_shown() } : null;
}

/** What picking a node's row does: shows it in the block — or, a node an integration keeps, turns the block into the integration's ("As <its block>"). */
export function embedRowAction(family: EmbedFamily, node: NodeSearchResult, actions: BlockSettingsActions): string {
  const to = node.plugin ? dispatch(family, node.plugin, actions) : null;
  return to?.ok ? m.editor_embed_as_block({ block: kindName(to.kind.kind) }) : m.editor_embed_show();
}

/** Shows a picked node: in the block, or by turning the block into the kind that shows it. */
export function pickEmbed(family: EmbedFamily, node: NodeSearchResult, target: Target, actions: BlockSettingsActions): void {
  if (!node.plugin) {
    target.update({ nodeId: node.id });
    return;
  }
  const to = dispatch(family, node.plugin, actions);
  if (to.ok) actions.swapEmbed?.(to.kind, node.id);
}

/**
 * The actions an embedding block's panel asks of the editor. Each context
 * getter is read when called: they change under an open panel.
 */
export function embedActions(ctx: {
  editor: () => Editor | null | undefined;
  target: () => Target | null;
  namespace: () => NodePickerCreate['namespace'] | null;
  enabledPlugins: () => ReadonlySet<string>;
}): Pick<BlockSettingsActions, 'createIn' | 'embedKindFor' | 'swapEmbed'> {
  return {
    createIn: () => ctx.namespace(),
    embedKindFor: (family, source) => embedKindFor(family, source, ctx.enabledPlugins()),
    swapEmbed: (kind, nodeId) => {
      const editor = ctx.editor();
      const id = ctx.target()?.id;
      if (editor && id) replaceBlockKind(editor, id, { type: kind.kind, attrs: { [kind.nodeAttr]: nodeId } });
    },
  };
}
