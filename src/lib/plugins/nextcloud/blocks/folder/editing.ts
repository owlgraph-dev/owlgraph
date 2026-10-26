// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The folder listing's one write, for the editor (tiptap.ts) and a collection
// page's writers (views/CollectionBody.svelte). The route checks the writer.
import { PLUGIN_ROUTES } from '../routes';
import type { FolderEditing } from './view';

export function editingFor(collectionId: string | null): FolderEditing | null {
  if (!collectionId) return null;
  return {
    async createDocument(path, fileid) {
      try {
        const res = await fetch(`${PLUGIN_ROUTES}/documents`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({ collectionId, path, fileid }),
        });
        if (!res.ok) return null;
        const { document } = (await res.json()) as { document?: { id: string; href: string } };
        return document ? { id: document.id, href: document.href } : null;
      } catch {
        return null;
      }
    },
  };
}
