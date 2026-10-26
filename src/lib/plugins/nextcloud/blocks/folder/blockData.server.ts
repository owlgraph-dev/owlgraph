// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// What a page's folder blocks show before their islands ask (docs/architecture/plugins.md,
// "Block data"): the held listing's first rows, or `loading` with a fetch for
// next time started, unawaited. The page waits for this, so it never waits on Nextcloud.
import type { PluginBlockDataResolver } from '$lib/plugins/api';
import { listingOf, type ListingView } from '../../server/listing.server';
import { folderConfig } from './model';

/** The rows a page renders before its island fetches the rest. */
export const SNAPSHOT_ROWS = 50;

/** `view` is null when the collection is not the viewer's to read. */
export interface FolderBlockData {
  view: ListingView | null;
}

export const resolveFolderBlocks: PluginBlockDataResolver = async (blocks, host) => {
  const out: Record<string, FolderBlockData> = {};
  for (const block of blocks) {
    const config = folderConfig(block.attrs);
    if (!config.collectionId) continue;
    const collection = await host.nodes.read(config.collectionId);
    if (!collection || collection.type !== 'collection') {
      out[block.blockId] = { view: null };
      continue;
    }
    const view = await listingOf(
      host,
      collection,
      { path: config.startPath, sort: config.sortKey, dir: config.sortDir, offset: 0, limit: Math.min(config.pageSize, SNAPSHOT_ROWS) },
      { network: false, warm: true }
    );
    out[block.blockId] = { view };
  }
  return out;
};
