// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The document block's agent input. The node is sparse, so the block's
// defaults decide what the agent leaves out. An agent embeds only a document
// it may read; each reader then sees it only if they may read it too.
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { placementShape, spacingShape, surfaceShape, typographyShape } from '../../capabilities/inputShapes.server';
import type { JsonNode } from '../../doc/doc';
import type { BlockRefResolvers } from '../blockInput.server';
import { DOCUMENT_BLOCK } from './model';

export const documentInputShape = z.object({
  kind: z.literal('document'),
  nodeId: z
    .string()
    .uuid()
    .describe(
      'An uploaded or linked document (list_documents, search). A reader who may not read it sees nothing of it. A document an integration keeps has a block kind of its own — the error names it.'
    ),
  variant: z.enum(['row', 'card']).optional().describe("'row' (the default) or 'card' (its type as a tile on top)."),
  titleMode: z.enum(['auto', 'node', 'filename']).optional().describe("What titles it: 'auto' (a row its file's name, a card the document's title — the default), 'node' or 'filename'."),
  preview: z.enum(['auto', 'none']).optional().describe("A card's tile: 'auto' (the default) or 'none'."),
  showMeta: z.boolean().optional().describe('Its details: type, size, day — or a link’s host. Default true.'),
  showDownload: z.boolean().optional().describe('An upload’s download. Default true.'),
  showNodeLink: z.boolean().optional().describe('A link to the document’s own page. Default false.'),
  placement: placementShape,
  surface: surfaceShape,
  spacing: spacingShape,
  typography: typographyShape,
});

export type DocumentInput = z.infer<typeof documentInputShape>;

/** Blind: buildDocument is the checked path. */
export function documentNode(input: DocumentInput): JsonNode {
  const attrs: Record<string, unknown> = { blockId: randomUUID(), nodeId: input.nodeId };
  for (const key of ['variant', 'titleMode', 'preview', 'showMeta', 'showDownload', 'showNodeLink', 'placement', 'surface', 'spacing', 'typography'] as const) {
    if (input[key] !== undefined) attrs[key] = input[key];
  }
  return { type: DOCUMENT_BLOCK, attrs };
}

/** Refused when the writing agent may not read the document, or an integration keeps it. */
export async function buildDocument(input: DocumentInput, refs: BlockRefResolvers): Promise<JsonNode> {
  const target = refs.resolveEmbedTarget ? await refs.resolveEmbedTarget(input.nodeId) : null;
  if (!target || target.type !== 'document') throw new Error(`document ${input.nodeId} not found`);
  if (target.plugin) {
    const kind = refs.embedKindOf?.(target.plugin, 'document');
    throw new Error(`document ${input.nodeId} is kept by an integration (${target.plugin})${kind ? ` — embed it with kind '${kind}'` : ''}`);
  }
  return documentNode(input);
}
