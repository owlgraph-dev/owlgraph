// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The placeholder's JSON operations, for the server and Node tooling: they
// must not import Tiptap, unlike ./placeholderOps.
import type { JsonNode } from '../../doc/doc';
import { isUnknownNode } from '../../doc/unknownBlocks';
import { newBlockId } from '../shared/ids';

// Containers whose content spec requires a child. A table cell is `inline*`
// and needs no filler.
const CONTAINER_TYPES = new Set(['doc', 'gridCell', 'flexCell']);

// In place. A placeholder must never be persisted, so persisting a page
// (features/pages/pages.server.ts) does this first.
export function stripPlaceholders(doc: JsonNode): void {
  const walk = (node: JsonNode) => {
    if (!Array.isArray(node.content)) return;
    node.content = node.content.filter((c) => c.type !== 'placeholder');
    // A node this build cannot read is kept as it was, inside too (docs/architecture/blocks/anatomy.md, "Unknown blocks").
    for (const child of node.content) if (!isUnknownNode(child)) walk(child);
  };
  walk(doc);
}

// As a new tree, sharing what holds no placeholder, for a reader that may not
// change what it compares (pages/pageDiff.ts).
export function withoutPlaceholders<T extends JsonNode>(doc: T): T {
  const visit = (node: JsonNode): JsonNode => {
    const children = node.content;
    if (!Array.isArray(children) || isUnknownNode(node)) return node;
    let changed = false;
    const next: JsonNode[] = [];
    for (const child of children) {
      if (child?.type === 'placeholder') {
        changed = true;
        continue;
      }
      const result = child && typeof child === 'object' ? visit(child) : child;
      if (result !== child) changed = true;
      next.push(result);
    }
    return changed ? { ...node, content: next } : node;
  };
  return visit(doc) as T;
}

// Refills the containers that persisted empty, which their content spec
// forbids, at editor load. Ids are stamped here: the live backfill runs on
// appendTransaction, which never fires for the initial state.
export function rehydratePlaceholders(doc: JsonNode): void {
  const walk = (node: JsonNode) => {
    if (Array.isArray(node.content)) node.content.forEach(walk);
    if (CONTAINER_TYPES.has(node.type) && (!node.content || node.content.length === 0)) {
      node.content = [{ type: 'placeholder', attrs: { blockId: newBlockId() } }];
    }
  };
  walk(doc);
}
