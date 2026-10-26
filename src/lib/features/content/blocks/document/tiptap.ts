// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The document block's schema and NodeView (docs/architecture/blocks/anatomy.md).
// In the editor it speaks the interface's language and follows the document
// through the configured `source`.
import { Node } from '@tiptap/core';
import { getLocale } from '$lib/paraglide/runtime';
import { surfaceAttr } from '../../capabilities/surface/surface';
import { typographyAttr } from '../../capabilities/typography/typography';
import { placementAttr } from '../../capabilities/placement/placement';
import { getTypographyRegistry } from '../../capabilities/typography/typographyRegistry';
import { getBlockDefaults } from '../../capabilities/defaults/defaultsRegistry';
import { svelteNodeView } from '../scaffold/svelteNodeView.svelte';
import { dataAttr, flagValue, textValue } from '../scaffold/dataAttr';
import type { EmbedSource } from '../embeds';
import DocumentBlock from './DocumentBlock.svelte';
import { DOCUMENT_BLOCK, type DocumentBlockData } from './model';
import { documentBlockProps, documentBlockTexts, documentBoxOverrides, documentWrapper } from './view';

export interface DocumentBlockOptions {
  /** Null where no editor configured one (a fixture). */
  source: EmbedSource<DocumentBlockData> | null;
}

export const DocumentBlockNode = Node.create<DocumentBlockOptions>({
  name: DOCUMENT_BLOCK,
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addOptions() {
    return { source: null };
  },

  addAttributes() {
    return {
      blockId: { default: null },
      nodeId: dataAttr<string | null>('nodeId', null, textValue),
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
    return [{ tag: 'div[data-document-block]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', { ...HTMLAttributes, 'data-document-block': '' }];
  },

  addStorage() {
    return { capabilities: ['surface', 'typography', 'placement'] };
  },

  addNodeView() {
    const options = this.options;
    return svelteNodeView(DocumentBlock, {
      wrapper: (node) => documentWrapper(node.attrs),
      props: (node, { styles }) =>
        documentBlockProps(node.attrs, {
          mode: 'editor',
          initial: undefined,
          source: options.source,
          texts: documentBlockTexts(true),
          locale: getLocale(),
          ruleId: styles.add(documentBoxOverrides(node.attrs, getTypographyRegistry(), getBlockDefaults())),
        }),
      // Another document remounts, so its data is followed from the start.
      key: (node) => String(node.attrs.nodeId ?? ''),
    });
  },
});
