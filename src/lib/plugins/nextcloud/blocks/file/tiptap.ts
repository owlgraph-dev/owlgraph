// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The file block's schema and NodeView (docs/architecture/blocks/anatomy.md): the
// page's component inside the block wrapper, an atom ProseMirror selects and
// drags. Another document is another view: the card's state is the one it shows.
import { Node } from '@tiptap/core';
import { dataAttr, flagValue, getBlockDefaults, getTypographyRegistry, placementAttr, surfaceAttr, textValue, typographyAttr } from '$lib/features/content';
import { svelteNodeView } from '$lib/features/content/editor';
import { currentLocale, type PluginEditorContext } from '$lib/plugins/api';
import FileCard from './FileCard.svelte';
import { documentEditing } from './documents';
import { FILE_BLOCK } from './model';
import { fileTexts } from './texts';
import { fileBoxOverrides, fileProps, fileWrapper, type FileEditing } from './view';


// What the block's own elements handle themselves; everything else is ProseMirror's.
const ownEvent = (event: Event) => !!(event.target as Element | null)?.closest?.('button, a, input');

// One editing handle per view (its document is fixed for the view's life), so the watch is not renewed on every attr change.
const editings = new WeakMap<object, FileEditing | null>();

export function fileExtension(_ctx: PluginEditorContext) {
  return Node.create({
    name: FILE_BLOCK,
    group: 'block',
    atom: true,
    selectable: true,
    draggable: true,

    addAttributes() {
      return {
        blockId: { default: null },
        documentId: dataAttr<string | null>('documentId', null, textValue),
        variant: dataAttr('variant', 'row', textValue),
        titleMode: dataAttr('titleMode', 'auto', textValue),
        preview: dataAttr('preview', 'auto', textValue),
        showMeta: dataAttr('showMeta', true, flagValue),
        showDownload: dataAttr('showDownload', true, flagValue),
        showNodeLink: dataAttr('showNodeLink', false, flagValue),
        surface: surfaceAttr(),
        typography: typographyAttr(),
        placement: placementAttr(),
      };
    },

    parseHTML() {
      return [{ tag: 'div[data-nextcloud-file]' }];
    },

    renderHTML({ HTMLAttributes }) {
      return ['div', { ...HTMLAttributes, 'data-nextcloud-file': '' }];
    },

    addStorage() {
      return { capabilities: ['surface', 'typography', 'placement'] };
    },

    addNodeView() {
      return svelteNodeView(FileCard, {
        wrapper: (node) => fileWrapper(node.attrs),
        key: (node) => String(node.attrs.documentId ?? ''),
        props: (node, { styles, view }) => {
          if (!editings.has(view)) {
            const id = typeof node.attrs.documentId === 'string' ? node.attrs.documentId : null;
            editings.set(view, id ? documentEditing(id) : null);
          }
          return fileProps(node.attrs, {
            mode: 'editor',
            initial: undefined,
            texts: fileTexts(true),
            locale: currentLocale(),
            ruleId: styles.add(fileBoxOverrides(node.attrs, getTypographyRegistry(), getBlockDefaults())),
            editing: editings.get(view) ?? null,
          });
        },
        stopEvent: ownEvent,
      });
    },
  });
}
