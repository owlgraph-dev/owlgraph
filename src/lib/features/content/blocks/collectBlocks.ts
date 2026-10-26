// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// What a block-data resolver walks before the page renders, to ask about all
// of a kind's blocks at once. Each id counts once: a query template's copies
// share one.

export interface BlockRef {
  blockId: string;
  attrs: Readonly<Record<string, unknown>>;
}

export function collectBlocks(doc: unknown, wanted: (type: string) => boolean): Map<string, BlockRef[]> {
  const byKind = new Map<string, BlockRef[]>();
  const seen = new Set<string>();
  const walk = (node: unknown, depth: number) => {
    if (!node || typeof node !== 'object' || depth > 256) return;
    const { type, attrs, content } = node as { type?: unknown; attrs?: unknown; content?: unknown };
    if (typeof type === 'string' && wanted(type) && attrs && typeof attrs === 'object') {
      const blockId = (attrs as { blockId?: unknown }).blockId;
      if (typeof blockId === 'string' && blockId !== '' && !seen.has(blockId)) {
        seen.add(blockId);
        let blocks = byKind.get(type);
        if (!blocks) byKind.set(type, (blocks = []));
        blocks.push({ blockId, attrs: attrs as Record<string, unknown> });
      }
    }
    if (Array.isArray(content)) for (const child of content) walk(child, depth + 1);
  };
  walk(doc, 0);
  return byKind;
}
