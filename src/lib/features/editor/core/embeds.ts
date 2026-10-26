// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The nodes the collection and document blocks embed, as the editor may read
// them (docs/architecture/blocks/node-embeds.md, "Collection and document blocks"): loaded once per
// node and shared by every block and block settings panel showing it.
import { loadCollectionEmbed } from '$lib/features/collections';
import { loadDocumentEmbed } from '$lib/features/documents';
import type { CollectionBlockData, DocumentBlockData, EmbedSource } from '$lib/features/content';

export interface EmbedStore<D> extends EmbedSource<D> {
  /** Loads the node anew and tells every block showing it. */
  refresh(nodeId: string): void;
  /** Forgets every node: the next block to ask loads it afresh (a new editor). */
  reset(): void;
}

function embedStore<D>(load: (nodeId: string) => Promise<D>): EmbedStore<D> {
  const entries = new Map<string, { data: D | undefined; listeners: Set<(data: D) => void>; request: number }>();

  const fetchInto = (nodeId: string) => {
    const entry = entries.get(nodeId);
    if (!entry) return;
    const mine = ++entry.request;
    void load(nodeId).then((data) => {
      // A later request — a refresh — wins over one still on its way.
      if (entries.get(nodeId) !== entry || entry.request !== mine) return;
      entry.data = data;
      for (const listener of entry.listeners) listener(data);
    });
  };

  return {
    watch(nodeId, listener) {
      let entry = entries.get(nodeId);
      if (!entry) {
        entries.set(nodeId, (entry = { data: undefined, listeners: new Set(), request: 0 }));
        fetchInto(nodeId);
      }
      entry.listeners.add(listener);
      if (entry.data !== undefined) listener(entry.data);
      const watched = entry;
      return () => {
        watched.listeners.delete(listener);
      };
    },
    refresh(nodeId) {
      if (entries.has(nodeId)) fetchInto(nodeId);
    },
    reset() {
      entries.clear();
    },
  };
}

/** What collection blocks show, by collection. */
export const collectionEmbeds = embedStore<CollectionBlockData>(loadCollectionEmbed);
/** What document blocks show, by document. */
export const documentEmbeds = embedStore<DocumentBlockData>(loadDocumentEmbed);
