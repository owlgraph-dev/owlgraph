// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The page-owned assets a document references (docs/architecture/blocks/capabilities.md, "Asset
// references"). The save path's garbage collection keeps exactly these, so a
// reference this walk misses is an asset deleted on the next save.
import type { JsonNode } from './doc';
import { TIERS, type Tier } from '../capabilities/cascade';
import { isAssetId } from '$lib/features/media';
import { isUnknownNode } from './unknownBlocks';

/** Every asset id the document references. */
export function collectAssetIds(doc: JsonNode): Set<string> {
  const ids = new Set<string>();
  // In a node this build can't read, every asset-id value counts: a file too
  // many is a stray upload, one too few a broken block once its kind is back.
  const scan = (value: unknown) => {
    if (isAssetId(value)) ids.add(value);
    else if (Array.isArray(value)) value.forEach(scan);
    else if (value && typeof value === 'object') Object.values(value).forEach(scan);
  };
  const walk = (node: JsonNode) => {
    if (!node || typeof node !== 'object') return;
    if (isUnknownNode(node)) return scan(node);
    if (node.type === 'image' && node.attrs?.assetId) ids.add(String(node.attrs.assetId));
    const surface = node.attrs?.surface;
    if (surface && typeof surface === 'object') {
      for (const bp of TIERS) {
        const image = (surface as Record<string, { image?: unknown } | undefined>)[bp]?.image;
        if (isAssetId(image)) ids.add(image);
      }
    }
    for (const child of node.content ?? []) walk(child);
  };
  walk(doc);
  return ids;
}
