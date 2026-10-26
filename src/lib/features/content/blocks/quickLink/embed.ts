// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// A quick link to a document becomes the block that shows it (docs/architecture/blocks/node-embeds.md,
// "A quick link becomes a block"), carrying of its surface what its variant draws.
import type { Editor } from '@tiptap/core';
import { blockNodeById, replaceBlockKind } from '../shared/blockOps';
import type { EmbedKind } from '../embeds';
import { quickLinkSurface } from './variants';

/** The document a quick link points at, or null for a link to a page or an address. */
export function quickLinkDocument(attrs: Readonly<Record<string, unknown>> | null | undefined): string | null {
  return attrs?.refType === 'document' && typeof attrs.targetDocId === 'string' && attrs.targetDocId ? attrs.targetDocId : null;
}

/** Turns the quick link with this id into a block of `kind` showing its document; false when it is no quick link to a document. */
export function embedQuickLink(editor: Editor, id: string, kind: EmbedKind): boolean {
  const node = blockNodeById(editor, id);
  const documentId = node?.type.name === 'quickLink' ? quickLinkDocument(node.attrs) : null;
  if (!documentId) return false;
  const surface = quickLinkSurface(node.attrs);
  return replaceBlockKind(editor, id, {
    type: kind.kind,
    attrs: { [kind.nodeAttr]: documentId },
    carry: { surface: Object.keys(surface).length > 0 ? surface : null },
  });
}
