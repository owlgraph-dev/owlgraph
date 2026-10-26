// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The image a page opens with (docs/architecture/media.md, "The image a page opens with"),
// fetched first. A background image is preloaded from the head, since the
// browser finds it only once the page's stylesheet applies.
import type { JsonNode } from '../../doc/doc';
import { TIERS, type Tier } from '../../capabilities/cascade';
import { SURFACE_IMAGE_TYPES, resolvedImageLayer, layerImageCandidates } from '../../capabilities/surface/surfaceImage';
import type { SurfaceData } from '../../capabilities/surface/surface';
import { isAssetId } from '$lib/features/media';

const OPENING_BLOCKS = 2;

export type LeadImage = { kind: 'image'; node: JsonNode } | { kind: 'background'; node: JsonNode };

/** In document order, a block's background before what it holds. */
export function leadImage(content: readonly JsonNode[] | undefined): LeadImage | null {
  let found: LeadImage | null = null;
  const walk = (node: JsonNode) => {
    if (found || !node || typeof node !== 'object') return;
    if (node.type === 'image' && isAssetId(node.attrs?.assetId)) {
      found = { kind: 'image', node };
      return;
    }
    const surface = node.attrs?.surface as SurfaceData | undefined;
    if (SURFACE_IMAGE_TYPES.has(node.type) && TIERS.some((bp) => resolvedImageLayer(surface, bp))) {
      found = { kind: 'background', node };
      return;
    }
    for (const child of node.content ?? []) walk(child);
  };
  for (const block of (content ?? []).slice(0, OPENING_BLOCKS)) walk(block);
  return found;
}

/** A `<link rel="preload" as="image">` in the document's head. */
export interface ImagePreload {
  href: string;
  /** The candidates by screen density, where there is more than one. */
  imagesrcset?: string;
  /** The viewports of the canvas tier the image belongs to. */
  media: string;
}

// The canvas tiers by viewport: a preload can only ask the window, and a
// reader's canvas is about as wide (docs/architecture/responsive.md).
const TIER_MEDIA: Record<Tier, string> = {
  desktop: '(min-width: 901px)',
  tablet: '(min-width: 641px) and (max-width: 900px)',
  phone: '(max-width: 640px)',
};

/** The copies each tier's stylesheet asks for; none for an image block. */
export function leadImagePreloads(lead: LeadImage | null): ImagePreload[] {
  if (lead?.kind !== 'background') return [];
  const surface = lead.node.attrs?.surface as SurfaceData | undefined;
  return TIERS.flatMap((bp) => {
    const layer = resolvedImageLayer(surface, bp);
    if (!layer) return [];
    const candidates = layerImageCandidates(layer, bp);
    return [
      {
        href: candidates[0][0],
        ...(candidates.length > 1 ? { imagesrcset: candidates.map(([url, density]) => `${url} ${density}`).join(', ') } : {}),
        media: TIER_MEDIA[bp],
      },
    ];
  });
}
