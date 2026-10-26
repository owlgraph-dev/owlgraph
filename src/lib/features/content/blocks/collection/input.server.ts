// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The collection block's agent input. The node is sparse, so the block's
// defaults decide what the agent leaves out. An agent embeds only a collection
// it may read; each reader then sees what they may read of it.
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { placementShape, spacingShape, surfaceShape, typographyShape } from '../../capabilities/inputShapes.server';
import type { JsonNode } from '../../doc/doc';
import type { BlockRefResolvers } from '../blockInput.server';
import { COLLECTION_BLOCK, MAX_COLLECTION_LIMIT } from './model';

export const collectionInputShape = z.object({
  kind: z.literal('collection'),
  nodeId: z
    .string()
    .uuid()
    .describe(
      'A curated collection (get_collection, search). Each reader of the page sees the members they may read, in the collection’s order; a reader who may not read the collection sees nothing of it. A collection an integration mirrors has a block kind of its own — the error names it.'
    ),
  limit: z.number().int().min(1).max(MAX_COLLECTION_LIMIT).optional().describe('Entries shown before "All n entries", which links the collection’s own page. Default 20.'),
  density: z.enum(['normal', 'compact']).optional(),
  showLabels: z.boolean().optional().describe('Show what the collection calls a member (its label) instead of the member’s title. Default true.'),
  columns: z.array(z.enum(['kind'])).optional().describe("The columns beside a member's name: 'kind' (its type, and where a mirrored one comes from). Default ['kind']; [] for none."),
  placement: placementShape,
  surface: surfaceShape,
  spacing: spacingShape,
  typography: typographyShape,
});

export type CollectionInput = z.infer<typeof collectionInputShape>;

/** Blind: buildCollection is the checked path. */
export function collectionNode(input: CollectionInput): JsonNode {
  const attrs: Record<string, unknown> = { blockId: randomUUID(), nodeId: input.nodeId };
  for (const key of ['limit', 'density', 'showLabels', 'columns', 'placement', 'surface', 'spacing', 'typography'] as const) {
    if (input[key] !== undefined) attrs[key] = input[key];
  }
  return { type: COLLECTION_BLOCK, attrs };
}

/** Refused when the writing agent may not read the collection, or an integration mirrors it. */
export async function buildCollection(input: CollectionInput, refs: BlockRefResolvers): Promise<JsonNode> {
  const target = refs.resolveEmbedTarget ? await refs.resolveEmbedTarget(input.nodeId) : null;
  if (!target || target.type !== 'collection') throw new Error(`collection ${input.nodeId} not found`);
  if (target.plugin) {
    const kind = refs.embedKindOf?.(target.plugin, 'collection');
    throw new Error(`collection ${input.nodeId} is mirrored by an integration (${target.plugin})${kind ? ` — embed it with kind '${kind}'` : ''}`);
  }
  return collectionNode(input);
}
