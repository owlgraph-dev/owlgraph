// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The quick link's agent input. The node is sparse: a field left out
// stays out, so Auto and the variant inference decide, as in the editor.
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { placementShape, surfaceShape } from '../../capabilities/inputShapes.server';
import type { JsonNode } from '../../doc/doc';
import type { BlockRefResolvers } from '../blockInput.server';
import { QUICK_LINK_VARIANTS } from './variants';

// relationshipType is an optional relationship_types slug; properties only count with it.
export const quickLinkInputShape = z.object({
  kind: z.literal('quickLink'),
  placement: placementShape,
  targetPageId: z.string().optional(),
  targetDocId: z.string().optional(),
  url: z.string().optional(),
  label: z.string().optional(),
  variant: z
    .enum(QUICK_LINK_VARIANTS)
    .optional()
    .describe("The card's look: 'link' (text with an underline), 'outlined' (a border, no fill) or 'button' (filled). Omit for a link. The look's colours come from the site's block defaults for cards, else the theme; surface fine-tunes only the fields the look carries."),
  surface: surfaceShape,
  icon: z.string().optional(),
  iconPosition: z.enum(['left', 'top']).optional(),
  underline: z.boolean().optional(),
  relationshipType: z.string().optional(),
  properties: z.record(z.string(), z.string()).optional(),
});

export type QuickLinkInput = z.infer<typeof quickLinkInputShape>;

/**
 * `resolved` is the looked-up target: its slug (for the editor's href) and
 * title (the label when none was given). Without it the node is built as given.
 */
export function quickLinkNode(input: QuickLinkInput, resolved: { slug?: string; title?: string } = {}): JsonNode {
  // The first target given wins, in buildQuickLink's order.
  const refType = input.targetPageId ? 'page' : input.targetDocId ? 'document' : input.url ? 'url' : 'page';
  const attrs: Record<string, unknown> = { refType, blockId: randomUUID() };
  if (refType === 'page') Object.assign(attrs, { targetPageId: input.targetPageId ?? null, targetSlug: resolved.slug ?? '' });
  if (refType === 'document') attrs.targetDocId = input.targetDocId;
  if (refType === 'url') attrs.url = input.url;
  attrs.label = input.label ?? resolved.title ?? input.url ?? '';
  for (const key of ['variant', 'surface', 'placement', 'icon', 'iconPosition', 'underline'] as const) {
    if (input[key] !== undefined) attrs[key] = input[key];
  }
  // A typed edge needs a node at its other end; an address card carries none.
  if (refType !== 'url') {
    if (input.relationshipType) attrs.relationshipType = input.relationshipType;
    if (input.properties) attrs.properties = input.properties;
  }
  return { type: 'quickLink', attrs, content: [] };
}

/** A target that doesn't exist is refused. */
export async function buildQuickLink(input: QuickLinkInput, refs: BlockRefResolvers): Promise<JsonNode> {
  if (input.targetPageId) {
    const target = await refs.resolvePage(input.targetPageId);
    if (!target) throw new Error(`quick link target page ${input.targetPageId} not found`);
    return quickLinkNode({ ...input, targetPageId: target.id }, target);
  }
  if (input.targetDocId) {
    const doc = await refs.resolveDocument(input.targetDocId);
    if (!doc) throw new Error(`quick link target document ${input.targetDocId} not found`);
    return quickLinkNode({ ...input, targetDocId: doc.id }, doc);
  }
  if (input.url) return quickLinkNode(input);
  throw new Error('a quick link needs one of targetPageId, targetDocId, or url');
}
