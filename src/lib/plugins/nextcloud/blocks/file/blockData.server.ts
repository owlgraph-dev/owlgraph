// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// What a page's file blocks show (docs/architecture/plugins.md, "Block data"): each document
// as last recorded; null where the viewer may not read it or the plugin is off.
// A document of someone's own files shows only to a viewer with an active
// connection; anyone else is told to connect. Nothing here asks Nextcloud.
import type { PluginBlockDataResolver } from '$lib/plugins/api';
import { documentView, ownAccess, type DocumentView } from '../../server/documents.server';
import { fileConfig } from './model';

/** `view` is null when not the viewer's to read, or the plugin is off. */
export interface FileBlockData {
  view: DocumentView | null;
}

export const resolveFileBlocks: PluginBlockDataResolver = async (blocks, host) => {
  const out: Record<string, FileBlockData> = {};
  const enabled = (await host.settings()).enabled;
  for (const block of blocks) {
    const { documentId } = fileConfig(block.attrs);
    if (!documentId) continue;
    if (!enabled) {
      out[block.blockId] = { view: null };
      continue;
    }
    const doc = await host.nodes.read(documentId);
    const view = doc && doc.type === 'document' ? await documentView(host, doc) : null;
    const access = view ? await ownAccess(host, view) : null;
    out[block.blockId] = { view: view && access ? { ...view, ...access } : view };
  }
  return out;
};
