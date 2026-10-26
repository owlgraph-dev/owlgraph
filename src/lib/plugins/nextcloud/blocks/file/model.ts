// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The file block's model (docs/architecture/nextcloud.md, "The file block"): one document by
// id and how it is drawn; what the file is comes from the document, never the
// block. Read by the manifest, so it imports nothing at runtime outside the plugin.
import type { Attrs, BlockFacets, BlockEdge, JsonNode, SurfaceData } from '$lib/features/content';
import type { PluginBlockKind } from '$lib/plugins/api';

export const FILE_BLOCK = 'nextcloudFile';

export type FileVariant = 'row' | 'card';
/** `auto`: a row is titled by its file name, a card by its node's title. */
export type FileTitleMode = 'auto' | 'node' | 'filename';
export type FilePreview = 'auto' | 'none';

export interface FileConfig {
  documentId: string | null;
  variant: FileVariant;
  titleMode: FileTitleMode;
  preview: FilePreview;
  showMeta: boolean;
  showDownload: boolean;
  showNodeLink: boolean;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The attrs checked, with the default where none or nonsense is stored. */
export function fileConfig(attrs: Readonly<Record<string, unknown>> | null | undefined): FileConfig {
  const a = attrs ?? {};
  return {
    documentId: typeof a.documentId === 'string' && UUID.test(a.documentId) ? a.documentId : null,
    variant: a.variant === 'card' ? 'card' : 'row',
    titleMode: a.titleMode === 'node' || a.titleMode === 'filename' ? a.titleMode : 'auto',
    preview: a.preview === 'none' ? 'none' : 'auto',
    showMeta: a.showMeta !== false,
    showDownload: a.showDownload !== false,
    showNodeLink: a.showNodeLink === true,
  };
}

/** As the Insert menu adds it: no document yet. */
export function newFileNode(): JsonNode {
  return { type: FILE_BLOCK, attrs: { blockId: null, documentId: null } };
}

const fileFacets: BlockFacets = {
  summary: (attrs: Attrs) => {
    const id = fileConfig(attrs).documentId;
    return id ? `Nextcloud file: document ${id}` : 'Nextcloud file: no document chosen';
  },
  // The page shows the document: a graph edge (syncEdges).
  edges: (attrs: Attrs): BlockEdge[] => {
    const id = fileConfig(attrs).documentId;
    return id ? [{ targetId: id, relationshipType: null, properties: [] }] : [];
  },
  ground: {
    surface: (attrs: Attrs) => ((attrs as { surface?: SurfaceData }).surface ?? {}) as SurfaceData,
    defaultBg: (_attrs, blockDefaults) => blockDefaults.groups.cards.bg ?? null,
    fill: 'card',
  },
};

export const fileKind = {
  name: FILE_BLOCK,
  group: 'cards',
  addressable: true,
  ownBlockIdAttr: true,
  spaced: true,
  embeds: { family: 'document', nodeAttr: 'documentId' },
  facets: fileFacets,
  sample: { type: FILE_BLOCK, attrs: { blockId: 'sample-file-block', documentId: null } },
} as const satisfies PluginBlockKind;
