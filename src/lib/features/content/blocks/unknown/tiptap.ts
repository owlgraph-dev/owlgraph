// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The stand-in for a stored node the editor cannot draw (docs/architecture/blocks/anatomy.md,
// "Unknown blocks"). It carries that node whole in `original`, untouched, and
// takes no capability; it can be moved and deleted, never edited.
import { Node } from '@tiptap/core';
import { svelteNodeView } from '../scaffold/svelteNodeView.svelte';
import { dataAttr, jsonDataAttr, textValue } from '../scaffold/dataAttr';
import { UNKNOWN_BLOCK, isStandInOriginal } from '../../doc/unknownBlocks';
import type { JsonNode } from '../../doc/doc';
import UnknownBlock from './UnknownBlock.svelte';
import { unknownBlockProps, unknownWrapper } from './view';

export const UnknownBlockNode = Node.create({
  name: UNKNOWN_BLOCK,
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      blockId: { default: null },
      originalType: dataAttr<string>('originalType', '', textValue),
      original: jsonDataAttr<JsonNode | null>('original', null),
      plugin: dataAttr<string | null>('plugin', null, textValue),
    };
  },

  parseHTML() {
    // Only a stand-in that holds what it says: one in pasted HTML could
    // otherwise put any node in the page, unseen behind "Unknown block".
    return [
      {
        tag: 'div[data-unknown-block]',
        getAttrs: (element) => {
          let original: unknown = null;
          try {
            original = JSON.parse((element as HTMLElement).getAttribute('data-original') ?? 'null');
          } catch {
            return false;
          }
          return isStandInOriginal(original, (element as HTMLElement).getAttribute('data-original-type')) ? null : false;
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', { ...HTMLAttributes, 'data-unknown-block': '' }];
  },

  addNodeView() {
    return svelteNodeView(UnknownBlock, {
      wrapper: (node) => unknownWrapper(node.attrs),
      props: (node) => unknownBlockProps(node.attrs),
    });
  },
});
