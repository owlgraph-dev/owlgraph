// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// A node's attributes written by its position, for what the selection reaches
// by chain position rather than by block id: an id-less cell, a container, a
// list, the typography target, a node the block tools act on.
import type { Editor } from '@tiptap/core';
import { setLayoutField, type Tier } from '$lib/features/content';

/** Merges `patch` into the attributes of the node at `pos`; a position below 0 is none. */
export function setAttrsAt(editor: Editor, pos: number, patch: Record<string, unknown>): void {
  if (pos < 0) return;
  const n = editor.state.doc.nodeAt(pos);
  if (n) editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...n.attrs, ...patch }));
}

/**
 * One field of a flex row's layout at the tier edited. By position, not the
 * caret's container: the block tools act on the selected node, which can
 * differ from where the caret sits.
 */
export function setFlexLayoutField(editor: Editor, pos: number, tier: Tier, field: Parameters<typeof setLayoutField>[2], value: string | number | null): void {
  const n = editor.state.doc.nodeAt(pos);
  if (!n) return;
  editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...n.attrs, layout: setLayoutField(n.attrs.layout, tier, field, value) }));
}

/** A page section's span; the normal span is stored as none. */
export function setSectionSpan(editor: Editor, pos: number, value: string): void {
  setAttrsAt(editor, pos, { width: value === 'normal' ? null : value });
}
