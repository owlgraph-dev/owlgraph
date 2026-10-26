// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// What a quick link to a document can become: the block its document's
// source names, a plugin's only while it is on (docs/architecture/blocks/node-embeds.md, "A quick link
// becomes a block").
import type { Editor } from '@tiptap/core';
import { blockNodeById, embedQuickLink, quickLinkDocument } from '$lib/features/content/editor';
import { embedKindFor } from '$lib/features/content';
import { pluginLabel } from '$lib/plugins';
import { embedUnavailable } from '../blocks/embedPicker';
import type { QuickLinkEmbed } from '../blockSettings/types';

export type QuickLinkEmbedFor = (attrs: Readonly<Record<string, unknown>>) => QuickLinkEmbed | null;

/** From the documents the editor was given and the plugins turned on; null for a link to anything else. */
export function quickLinkEmbedFor(documents: { id: string; plugin?: string | null }[], enabledPlugins: ReadonlySet<string>): QuickLinkEmbedFor {
  const documentSources = new Map(documents.map((d) => [d.id, d.plugin ?? null]));
  return (attrs) => {
    const documentId = quickLinkDocument(attrs);
    if (!documentId || !documentSources.has(documentId)) return null;
    const source = documentSources.get(documentId) ?? null;
    const to = embedKindFor('document', source, enabledPlugins);
    return to.ok ? { kind: to.kind } : { reason: embedUnavailable(to.reason, source ? pluginLabel(source) : '') };
  };
}

/** Turns the quick link with this id into the block it can become, if it can. */
export function embedQuickLinkById(editor: Editor | undefined, id: string, embedFor: QuickLinkEmbedFor): void {
  const node = editor ? blockNodeById(editor, id) : null;
  const embed = node ? embedFor(node.attrs) : null;
  if (editor && embed && 'kind' in embed) embedQuickLink(editor, id, embed.kind);
}
