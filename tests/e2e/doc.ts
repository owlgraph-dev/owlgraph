// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// A block named by an id carries it as its block id and its text, so a spec
// finds it in the editor or on the page as [data-block-id="<id>"].

export const txt = (text: string, marks?: unknown[]) => ({ type: 'text', text, ...(marks ? { marks } : {}) });

export const doc = (...content: unknown[]) => ({ type: 'doc', content });

export const para = (id: string, attrs: Record<string, unknown> = {}) => ({
  type: 'paragraph',
  attrs: { blockId: id, ...attrs },
  content: [txt(id)],
});

/** A node of a stored document, as a test builds and reads one. */
export type DocNode = { type: string; attrs?: Record<string, unknown>; content?: DocNode[]; marks?: { type: string; attrs?: Record<string, unknown> }[]; text?: string };

/** A paragraph with a block id and a text of its own. */
export const textPara = (blockId: string, text: string, marks?: DocNode['marks']): DocNode => ({
  type: 'paragraph',
  attrs: { blockId },
  content: [{ type: 'text', text, ...(marks ? { marks } : {}) }],
});

/** A block of a kind no build defines: an unknown block. */
export const retiredWidget = (blockId: string): DocNode => ({ type: 'retiredWidget', attrs: { blockId, setting: 1 } });

export const cell = (...blocks: unknown[]) => ({ type: 'gridCell', content: blocks });
