// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The `blockId` the overlay, the block settings panel and the MCP tools address a block by,
// as data-block-id. Ids are backfilled live, so a new block is addressable
// before a save, and duplicates from copy/paste are re-id'd; ensureBlockIds
// backs this up on the server.
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { ADDRESSABLE_BLOCK_TYPES, GLOBAL_BLOCK_ID_TYPES } from '../catalog';
import { newBlockId } from './ids';

export const BlockId = Extension.create({
  name: 'blockId',
  addGlobalAttributes() {
    return [
      {
        types: [...GLOBAL_BLOCK_ID_TYPES],
        attributes: {
          blockId: {
            default: null,
            parseHTML: (el) => el.getAttribute('data-block-id'),
            renderHTML: (attrs) => (attrs.blockId ? { 'data-block-id': attrs.blockId } : {}),
          },
        },
      },
    ];
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('blockIdBackfill'),
        appendTransaction(transactions, _oldState, newState) {
          if (!transactions.some((tr) => tr.docChanged)) return null;
          let tr: any = null;
          const seen = new Set<string>();
          newState.doc.descendants((node, pos, parent) => {
            // The list item is the addressable block: an id inside it would
            // make the overlay resolve to the inner paragraph.
            if (parent && parent.type.name === 'listItem') {
              if (node.attrs?.blockId) {
                tr = (tr ?? newState.tr).setNodeMarkup(pos, undefined, { ...node.attrs, blockId: null });
              }
              return;
            }
            if (!ADDRESSABLE_BLOCK_TYPES.has(node.type.name)) return;
            const id = node.attrs.blockId as string | null;
            if (!id || seen.has(id)) {
              const fresh = newBlockId();
              tr = (tr ?? newState.tr).setNodeMarkup(pos, undefined, { ...node.attrs, blockId: fresh });
              seen.add(fresh);
            } else {
              seen.add(id);
            }
          });
          return tr;
        },
      }),
    ];
  },
});
