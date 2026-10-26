// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The folder block's model (docs/architecture/nextcloud.md, "The folder block"): a live
// listing of a collection's share from a folder in it; the block stores none
// of what it lists. Read by the manifest, so it imports nothing at runtime
// outside the plugin.
import type { Attrs, BlockFacets, BlockEdge, JsonNode, SurfaceData } from '$lib/features/content';
import type { PluginBlockKind } from '$lib/plugins/api';
import { checkSharePath } from '../../sharePath';

export const FOLDER_BLOCK = 'nextcloudFolder';
export const FOLDER_ISLAND = 'nextcloud-folder';

export type FolderSortKey = 'name' | 'modified' | 'size';
export type FolderSortDir = 'asc' | 'desc';
export type FolderDensity = 'compact' | 'normal';

export const FOLDER_SORT_KEYS: readonly FolderSortKey[] = ['name', 'modified', 'size'];
export const MAX_FOLDER_PAGE_SIZE = 200;
export const DEFAULT_FOLDER_PAGE_SIZE = 50;

/** The stored attrs, all optional; the capability attrs sit beside them. */
export interface FolderAttrs {
  blockId?: string | null;
  collectionId?: string | null;
  /** Inside the share; '' for the share itself. */
  startPath?: string;
  density?: FolderDensity;
  sortKey?: FolderSortKey;
  sortDir?: FolderSortDir;
  showSize?: boolean;
  showModified?: boolean;
  /** Whether a reader may open subfolders. */
  allowNavigate?: boolean;
  pageSize?: number;
  /** Whether a file that is a document of the collection is marked. */
  highlightLinked?: boolean;
}

/** The attrs checked, with the default where none or nonsense is stored. */
export interface FolderConfig {
  collectionId: string | null;
  startPath: string;
  density: FolderDensity;
  sortKey: FolderSortKey;
  sortDir: FolderSortDir;
  showSize: boolean;
  showModified: boolean;
  allowNavigate: boolean;
  pageSize: number;
  highlightLinked: boolean;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function folderConfig(attrs: Readonly<Record<string, unknown>> | null | undefined): FolderConfig {
  const a = (attrs ?? {}) as FolderAttrs;
  const start = checkSharePath(a.startPath ?? '');
  const size = Number(a.pageSize);
  return {
    collectionId: typeof a.collectionId === 'string' && UUID.test(a.collectionId) ? a.collectionId : null,
    startPath: 'path' in start ? start.path : '',
    density: a.density === 'compact' ? 'compact' : 'normal',
    sortKey: a.sortKey === 'modified' || a.sortKey === 'size' ? a.sortKey : 'name',
    sortDir: a.sortDir === 'desc' ? 'desc' : 'asc',
    showSize: a.showSize !== false,
    showModified: a.showModified !== false,
    allowNavigate: a.allowNavigate !== false,
    pageSize: Number.isInteger(size) && size >= 1 ? Math.min(size, MAX_FOLDER_PAGE_SIZE) : DEFAULT_FOLDER_PAGE_SIZE,
    highlightLinked: a.highlightLinked !== false,
  };
}

/** As the Insert menu adds it: no collection yet. */
export function newFolderNode(): JsonNode {
  return { type: FOLDER_BLOCK, attrs: { blockId: null, collectionId: null, startPath: '' } };
}

const folderFacets: BlockFacets = {
  summary: (attrs: Attrs) => {
    const c = folderConfig(attrs);
    return c.collectionId ? `Nextcloud folder: collection ${c.collectionId}${c.startPath ? `, at ${c.startPath}` : ''}` : 'Nextcloud folder: no collection chosen';
  },
  // The page shows the collection: a graph edge (syncEdges).
  edges: (attrs: Attrs): BlockEdge[] => {
    const id = folderConfig(attrs).collectionId;
    return id ? [{ targetId: id, relationshipType: null, properties: [] }] : [];
  },
  ground: {
    surface: (attrs: Attrs) => ((attrs as { surface?: SurfaceData }).surface ?? {}) as SurfaceData,
    // A card's box: the theme's cards default, if any.
    defaultBg: (_attrs, blockDefaults) => blockDefaults.groups.cards.bg ?? null,
    fill: 'card',
  },
};

export const folderKind = {
  name: FOLDER_BLOCK,
  group: 'cards',
  addressable: true,
  ownBlockIdAttr: true,
  spaced: true,
  embeds: { family: 'collection', nodeAttr: 'collectionId' },
  facets: folderFacets,
  sample: { type: FOLDER_BLOCK, attrs: { blockId: 'sample-folder-block', collectionId: null, startPath: '' } },
} as const satisfies PluginBlockKind;
