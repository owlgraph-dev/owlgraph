// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import type { Editor as TiptapEditor } from '@tiptap/core';
import type { EmbedDispatch, EmbedFamily, EmbedKind } from '$lib/features/content';

// What every block settings section edits, with the write path back into the
// document: a section never knows whether its target is addressed by block id
// or by chain position.
export type Target = {
  type: string;
  id: string | null;
  attrs: Record<string, any>;
  update: (patch: Record<string, unknown>) => void;
};

/** What a block's settings panel may ask of the editor beyond writing its target. */
export interface BlockSettingsActions {
  /** Opens the link picker to retarget a quick-link card. */
  retarget?: (id: string) => void;
  /** Opens the image picker to replace an image block's picture. */
  replaceImage?: () => void;
  removeBlock?: () => void;
  /** Reports a popover or menu of the panel opening or closing. */
  overlayOpenChange?: (open: boolean) => void;
  /** Switches a page section to one column or back to the page's template, as one undo step. */
  setSectionSingle?: (single: boolean) => void;
  selectPage?: () => void;
  /** The namespace a node made from a panel's picker goes into (the page's); null when not known. */
  createIn?: () => { id: string; name: string; slug: string | null } | null;
  /** Which kind shows a node of a family from a source (its plugin; null for none), with the plugins turned on now. */
  embedKindFor?: (family: EmbedFamily, source: string | null) => EmbedDispatch;
  /** Turns the block into the kind given, showing the node given: its id and capabilities kept, one undo step. */
  swapEmbed?: (kind: EmbedKind, nodeId: string) => void;
  /** For a quick link to a document the editor may read: the kind it can become, or why it cannot; null for any other quick link. */
  quickLinkEmbed?: (attrs: Readonly<Record<string, unknown>>) => QuickLinkEmbed | null;
  /** Turns the quick link with this id into the block that shows its document (docs/architecture/blocks/node-embeds.md, "A quick link becomes a block"). */
  embedQuickLink?: (id: string) => void;
}

/** What a quick link to a document can become: the kind that shows the document, or why there is none (a sentence). */
export type QuickLinkEmbed = { kind: EmbedKind } | { reason: string };

/** The props of every block settings panel (editor/blocks/settings.ts). */
export interface BlockSettingsProps {
  target: Target;
  editor: TiptapEditor | null;
  actions: BlockSettingsActions;
}
