// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The collection block's schema and NodeView (docs/architecture/blocks/anatomy.md).
// In the editor it speaks the interface's language and follows the collection
// through the configured `source`.
import { Node } from '@tiptap/core';
import { getLocale } from '$lib/paraglide/runtime';
import { surfaceAttr } from '../../capabilities/surface/surface';
import { typographyAttr } from '../../capabilities/typography/typography';
import { placementAttr } from '../../capabilities/placement/placement';
import { getTypographyRegistry } from '../../capabilities/typography/typographyRegistry';
import { getBlockDefaults } from '../../capabilities/defaults/defaultsRegistry';
import { svelteNodeView } from '../scaffold/svelteNodeView.svelte';
import { dataAttr, flagValue, intValue, jsonDataAttr, textValue } from '../scaffold/dataAttr';
import CollectionBlock from './CollectionBlock.svelte';
import { COLLECTION_BLOCK, type CollectionBlockData } from './model';
import { collectionBlockProps, collectionBlockTexts, collectionBoxOverrides, collectionWrapper } from './view';
import type { EmbedSource } from '../embeds';

export interface CollectionBlockOptions {
  /** Null where no editor configured one (a fixture). */
  source: EmbedSource<CollectionBlockData> | null;
}

export const CollectionBlockNode = Node.create<CollectionBlockOptions>({
  name: COLLECTION_BLOCK,
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
      limit: dataAttr<number | null>('limit', null, intValue),
      density: dataAttr('density', 'normal', textValue),
      showLabels: dataAttr('showLabels', true, flagValue),
      columns: jsonDataAttr<string[] | null>('columns', null),
      surface: surfaceAttr(),
      typography: typographyAttr(),
      placement: placementAttr(),
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-collection-block]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', { ...HTMLAttributes, 'data-collection-block': '' }];
  },

  addStorage() {
    return { capabilities: ['surface', 'typography', 'placement'] };
  },

  addNodeView() {
    const options = this.options;
    return svelteNodeView(CollectionBlock, {
      wrapper: (node) => collectionWrapper(node.attrs),
      props: (node, { styles }) =>
        collectionBlockProps(node.attrs, {
          mode: 'editor',
          initial: undefined,
          source: options.source,
          texts: collectionBlockTexts(true),
          locale: getLocale(),
          ruleId: styles.add(collectionBoxOverrides(node.attrs, getTypographyRegistry(), getBlockDefaults())),
        }),
      // Another collection remounts, so its data is followed from the start.
      key: (node) => String(node.attrs.nodeId ?? ''),
    });
  },
});
