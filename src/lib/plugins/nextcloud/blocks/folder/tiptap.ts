// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The folder block's schema and NodeView (docs/architecture/blocks/anatomy.md): the
// page's component inside the block wrapper, an atom ProseMirror selects and drags.
import { Node } from '@tiptap/core';
import { dataAttr, flagValue, getBlockDefaults, getTypographyRegistry, placementAttr, surfaceAttr, textValue, typographyAttr } from '$lib/features/content';
import { svelteNodeView } from '$lib/features/content/editor';
import { currentLocale, type PluginEditorContext } from '$lib/plugins/api';
import FolderListing from './FolderListing.svelte';
import { PLUGIN_ROUTES } from '../routes';
import { editingFor } from './editing';
import { DEFAULT_FOLDER_PAGE_SIZE, FOLDER_BLOCK } from './model';
import { folderTexts } from './texts';
import { folderBoxOverrides, folderProps, folderWrapper } from './view';


// What the block's own elements handle themselves; everything else is ProseMirror's.
const ownEvent = (event: Event) => !!(event.target as Element | null)?.closest?.('button, a, input, [role="menuitem"]');

export function folderExtension(_ctx: PluginEditorContext) {
  return Node.create({
    name: FOLDER_BLOCK,
    group: 'block',
    atom: true,
    selectable: true,
    draggable: true,

    addAttributes() {
      return {
        blockId: { default: null },
        collectionId: dataAttr<string | null>('collectionId', null, textValue),
        startPath: dataAttr('startPath', '', textValue),
        density: dataAttr('density', 'normal', textValue),
        sortKey: dataAttr('sortKey', 'name', textValue),
        sortDir: dataAttr('sortDir', 'asc', textValue),
        showSize: dataAttr('showSize', true, flagValue),
        showModified: dataAttr('showModified', true, flagValue),
        allowNavigate: dataAttr('allowNavigate', true, flagValue),
        pageSize: dataAttr('pageSize', DEFAULT_FOLDER_PAGE_SIZE, (raw) => Number(raw) || DEFAULT_FOLDER_PAGE_SIZE),
        highlightLinked: dataAttr('highlightLinked', true, flagValue),
        surface: surfaceAttr(),
        typography: typographyAttr(),
        placement: placementAttr(),
      };
    },

    parseHTML() {
      return [{ tag: 'div[data-nextcloud-folder]' }];
    },

    renderHTML({ HTMLAttributes }) {
      return ['div', { ...HTMLAttributes, 'data-nextcloud-folder': '' }];
    },

    addStorage() {
      return { capabilities: ['surface', 'typography', 'placement'] };
    },

    addNodeView() {
      return svelteNodeView(FolderListing, {
        wrapper: (node) => folderWrapper(node.attrs),
        props: (node, { styles }) =>
          folderProps(node.attrs, {
            mode: 'editor',
            initial: undefined,
            texts: folderTexts(true),
            locale: currentLocale(),
            renderedAt: Date.now(),
            ruleId: styles.add(folderBoxOverrides(node.attrs, getTypographyRegistry(), getBlockDefaults())),
            base: PLUGIN_ROUTES,
            editing: editingFor(typeof node.attrs.collectionId === 'string' ? node.attrs.collectionId : null),
          }),
        stopEvent: ownEvent,
      });
    },
  });
}
