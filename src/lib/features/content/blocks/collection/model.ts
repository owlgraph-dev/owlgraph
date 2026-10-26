// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// A curated collection embedded on a page (docs/architecture/blocks/node-embeds.md, "Collection and
// document blocks"). The block stores only the id and how members read; the
// members are resolved for each reader before the page renders.
import type { LocalizedText } from '$lib/platform/i18n/localizedText';
import type { SurfaceData } from '../../capabilities/surface/surface';
import type { Attrs, JsonNode } from '../../doc/doc';
import type { BlockFacets, BlockEdge } from '../facets';
import type { EmbedNode } from '../embeds';
import type { NodeType } from '$lib/features/nodes';

export const COLLECTION_BLOCK = 'collectionBlock';

/** Members shown when the block says nothing, and at most. */
export const DEFAULT_COLLECTION_LIMIT = 20;
export const MAX_COLLECTION_LIMIT = 200;

export type CollectionDensity = 'compact' | 'normal';
/** The columns beside a member's name: its kind (type, and where a mirrored one comes from). */
export type CollectionColumn = 'kind';
export const COLLECTION_COLUMNS: readonly CollectionColumn[] = ['kind'];

/** The attrs checked, with the default where none or nonsense is stored. */
export interface CollectionBlockConfig {
  nodeId: string | null;
  limit: number;
  density: CollectionDensity;
  showLabels: boolean;
  columns: readonly CollectionColumn[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function collectionConfig(attrs: Readonly<Record<string, unknown>> | null | undefined): CollectionBlockConfig {
  const a = attrs ?? {};
  const limit = Number(a.limit);
  return {
    nodeId: typeof a.nodeId === 'string' && UUID.test(a.nodeId) ? a.nodeId : null,
    limit: a.limit != null && Number.isInteger(limit) && limit >= 1 ? Math.min(limit, MAX_COLLECTION_LIMIT) : DEFAULT_COLLECTION_LIMIT,
    density: a.density === 'compact' ? 'compact' : 'normal',
    showLabels: a.showLabels !== false,
    columns: Array.isArray(a.columns) ? COLLECTION_COLUMNS.filter((c) => (a.columns as unknown[]).includes(c)) : COLLECTION_COLUMNS,
  };
}

/** As the Insert menu adds it: no collection yet. */
export function newCollectionNode(): JsonNode {
  return { type: COLLECTION_BLOCK, attrs: { blockId: null, nodeId: null } };
}

/** A member, as the collection's own page lists it. */
export interface EmbedMember {
  id: string;
  type: NodeType;
  title: string;
  href: string;
  /** What the collection calls it, per language — localized where it is drawn. */
  label: LocalizedText | null;
  /** The integration a mirrored member comes from (its plugin's id), or null. */
  plugin: string | null;
  /** That integration's name. */
  pluginLabel: string | null;
}

/**
 * What a reader's page resolved for one collection block (RenderContext.blockData):
 *   hidden       not the reader's to read, gone or unset: the block renders nothing;
 *   unavailable  readable, but an integration mirrors it, so its own block lists it;
 *   members      the members the reader may read, up to the limit, and their total.
 * No entry (an agent's view, a version's preview) renders a neutral line.
 */
export type CollectionBlockData =
  | { state: 'hidden' }
  | { state: 'unavailable'; node: EmbedNode }
  | { state: 'members'; node: EmbedNode; members: EmbedMember[]; total: number };

export const collectionFacets: BlockFacets = {
  summary: (attrs: Attrs) => {
    const id = collectionConfig(attrs).nodeId;
    return id ? `collection ${id}` : 'collection: none chosen';
  },
  // An edge the graph draws, and "Referenced by" on the collection's page.
  edges: (attrs: Attrs): BlockEdge[] => {
    const id = collectionConfig(attrs).nodeId;
    return id ? [{ targetId: id, relationshipType: null, properties: [] }] : [];
  },
  ground: {
    surface: (attrs: Attrs) => ((attrs as { surface?: SurfaceData }).surface ?? {}) as SurfaceData,
    defaultBg: (_attrs, blockDefaults) => blockDefaults.groups.cards.bg ?? null,
    fill: 'card',
  },
};
