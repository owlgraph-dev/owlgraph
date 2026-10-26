// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// An uploaded or linked document embedded on a page (docs/architecture/blocks/node-embeds.md,
// "Collection and document blocks"). The block stores only the id and how it
// is drawn; the document is resolved for each reader before the page renders.
import type { SurfaceData } from '../../capabilities/surface/surface';
import type { Attrs, JsonNode } from '../../doc/doc';
import type { BlockFacets, BlockEdge } from '../facets';
import type { EmbedNode } from '../embeds';

export const DOCUMENT_BLOCK = 'documentBlock';

export type DocumentVariant = 'row' | 'card';
/** `auto` is the variant's choice: a row shows the file's name, a card the node's title. */
export type DocumentTitleMode = 'auto' | 'node' | 'filename';
export type DocumentPreview = 'auto' | 'none';

/** The attrs checked, with the default where none or nonsense is stored. */
export interface DocumentBlockConfig {
  nodeId: string | null;
  variant: DocumentVariant;
  titleMode: DocumentTitleMode;
  preview: DocumentPreview;
  showMeta: boolean;
  showDownload: boolean;
  showNodeLink: boolean;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function documentConfig(attrs: Readonly<Record<string, unknown>> | null | undefined): DocumentBlockConfig {
  const a = attrs ?? {};
  return {
    nodeId: typeof a.nodeId === 'string' && UUID.test(a.nodeId) ? a.nodeId : null,
    variant: a.variant === 'card' ? 'card' : 'row',
    titleMode: a.titleMode === 'node' || a.titleMode === 'filename' ? a.titleMode : 'auto',
    preview: a.preview === 'none' ? 'none' : 'auto',
    showMeta: a.showMeta !== false,
    showDownload: a.showDownload !== false,
    showNodeLink: a.showNodeLink === true,
  };
}

/** As the Insert menu adds it: no document yet. */
export function newDocumentNode(): JsonNode {
  return { type: DOCUMENT_BLOCK, attrs: { blockId: null, nodeId: null } };
}

/**
 * What a reader's page resolved for one document block (RenderContext.blockData):
 *   hidden       not the reader's to read, gone or unset: the block renders nothing;
 *   unavailable  readable, but an integration keeps it, so its own block shows it;
 *   file         an upload's file or a link's host (never its address), and where its content is read.
 * No entry (an agent's view, a version's preview) renders a neutral line.
 */
export type DocumentBlockData =
  | { state: 'hidden' }
  | { state: 'unavailable'; node: EmbedNode }
  | {
      state: 'file';
      node: EmbedNode;
      source: 'upload' | 'link';
      /** Null for a link. */
      file: { filename: string; mime: string | null; size: number | null } | null;
      /** A link's host ("doi.org"); null for an upload. */
      linkHost: string | null;
      /** `download` only for an upload. */
      content: { view: string; download: string | null };
      /** ISO. */
      modified: string | null;
    };

export const documentFacets: BlockFacets = {
  summary: (attrs: Attrs) => {
    const id = documentConfig(attrs).nodeId;
    return id ? `document ${id}` : 'document: none chosen';
  },
  // An edge the graph draws, and "Referenced by" on the document's page.
  edges: (attrs: Attrs): BlockEdge[] => {
    const id = documentConfig(attrs).nodeId;
    return id ? [{ targetId: id, relationshipType: null, properties: [] }] : [];
  },
  ground: {
    surface: (attrs: Attrs) => ((attrs as { surface?: SurfaceData }).surface ?? {}) as SurfaceData,
    defaultBg: (_attrs, blockDefaults) => blockDefaults.groups.cards.bg ?? null,
    fill: 'card',
  },
};
