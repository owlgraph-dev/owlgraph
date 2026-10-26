// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// What the blocks that embed a node share, and which kind shows a node: the
// core's for a node no integration keeps, a plugin's for its own
// (docs/architecture/blocks/node-embeds.md, "One family in the editor").
import { pluginOfBlockKind } from '$lib/plugins';
import { BLOCK_KINDS, type BlockKind, type EmbedFamily } from './catalog';

export interface EmbedNode {
  id: string;
  title: string;
  href: string;
}

/** The listener runs once the node is known and on every change; returns the unsubscribe. */
export interface EmbedSource<D> {
  watch(nodeId: string, listener: (data: D) => void): () => void;
}

/** `source` is the plugin whose nodes it shows, or null for the core's. */
export interface EmbedKind {
  kind: string;
  family: EmbedFamily;
  nodeAttr: string;
  source: string | null;
}

/** The core's first, in the catalogue's order. */
export const EMBED_KINDS: readonly EmbedKind[] = (BLOCK_KINDS as readonly BlockKind[]).flatMap((k) =>
  k.embeds ? [{ kind: k.name, family: k.embeds.family, nodeAttr: k.embeds.nodeAttr, source: pluginOfBlockKind(k.name) }] : []
);

export function embedKindOf(kind: string): EmbedKind | null {
  return EMBED_KINDS.find((k) => k.kind === kind) ?? null;
}

/** Or why none does: `off`, its source's plugin is turned off; `none`, no kind shows that source's nodes. */
export type EmbedDispatch = { ok: true; kind: EmbedKind } | { ok: false; reason: 'off' | 'none' };

/** `source` is the node's plugin, null for the core's; a plugin's kind counts only while it is enabled. */
export function embedKindFor(family: EmbedFamily, source: string | null, enabled: ReadonlySet<string>): EmbedDispatch {
  const kind = EMBED_KINDS.find((k) => k.family === family && k.source === source);
  if (!kind) return { ok: false, reason: 'none' };
  if (kind.source !== null && !enabled.has(kind.source)) return { ok: false, reason: 'off' };
  return { ok: true, kind };
}
