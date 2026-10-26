// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// What other features ask a block (its text, links, ground, a preview),
// answered by the block's own model.ts instead of a `node.type === …` check in
// the asking feature. A block without a row answers nothing.
import type { Attrs, JsonNode } from '../doc/doc';
import type { SurfaceData } from '../capabilities/surface/surface';
import type { ResolvedBlockDefaults } from '../capabilities/defaults/blockDefaults';
import type { FillKind } from '../color/colorTokens';
import type { BlockKindName } from './catalog';
import { quickLinkFacets } from './quickLink/model';
import { collectionFacets } from './collection/model';
import { documentFacets } from './document/model';
import { PLUGIN_BLOCK_FACETS } from '$lib/plugins';

/** An edge out of the page a block declares — the graph turns it into an `edges` row. */
export interface BlockEdge {
  targetId: string;
  /** An opt-in typed edge (a relationship_types slug), or null. */
  relationshipType: string | null;
  /** The edge's property values — only with a relationship type. */
  properties: { name: string; value: string }[];
}

/** How a block paints the ground its content sits on (color/schemeRegions.ts). */
export interface BlockGround {
  /** The surface that counts as its ground — e.g. only the fields its variant carries. */
  surface(attrs: Attrs): SurfaceData;
  /** The background it paints when it sets none of its own, or null for none. */
  defaultBg(attrs: Attrs, blockDefaults: ResolvedBlockDefaults): string | null;
  /** Which readable-text rule a fill follows (color/colorTokens.ts). */
  fill: FillKind;
}

export interface BlockFacets {
  /** The block's searchable text, from its attrs. */
  text?(attrs: Attrs): string;
  /** A one-line preview for an agent reading the page's blocks. */
  summary?(attrs: Attrs): string;
  /** The edges out of the page it declares. */
  edges?(attrs: Attrs): BlockEdge[];
  ground?: BlockGround;
}

const BLOCK_FACETS: Partial<Readonly<Record<BlockKindName, BlockFacets>>> = {
  quickLink: quickLinkFacets,
  collectionBlock: collectionFacets,
  documentBlock: documentFacets,
  ...PLUGIN_BLOCK_FACETS,
};

export function blockFacets(type: string | undefined): BlockFacets | undefined {
  return type && Object.prototype.hasOwnProperty.call(BLOCK_FACETS, type) ? BLOCK_FACETS[type as BlockKindName] : undefined;
}

/** Null when it declares none: its children speak for it. */
export function blockText(node: JsonNode): string | null {
  const text = blockFacets(node.type)?.text;
  return text ? text(node.attrs ?? {}) : null;
}

export function blockSummary(node: JsonNode): string | null {
  const summary = blockFacets(node.type)?.summary;
  return summary ? summary(node.attrs ?? {}) : null;
}

export function blockEdges(node: JsonNode): BlockEdge[] {
  return blockFacets(node.type)?.edges?.(node.attrs ?? {}) ?? [];
}
