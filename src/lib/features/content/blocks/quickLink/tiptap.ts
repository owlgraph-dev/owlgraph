// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The NodeView mounts the component the page renders (QuickLinkCard.svelte),
// so the editor and the page can't diverge.
import { Node, mergeAttributes } from '@tiptap/core';
import { safeTargetHref } from '../../render/linkTarget';
import { quickLinkLabel, type QuickLinkAttrs } from './model';
import { quickLinkVariantOrNull } from './variants';
import { quickLinkCardOverrides, quickLinkCardProps, quickLinkWrapper } from './view';
import { surfaceAttr } from '../../capabilities/surface/surface';
import { typographyAttr } from '../../capabilities/typography/typography';
import { getTypographyRegistry } from '../../capabilities/typography/typographyRegistry';
import { getBlockDefaults } from '../../capabilities/defaults/defaultsRegistry';
import { placementAttr } from '../../capabilities/placement/placement';
import { svelteNodeView } from '../scaffold/svelteNodeView.svelte';
import QuickLinkCard from './QuickLinkCard.svelte';

export const QuickLink = Node.create({
  name: 'quickLink',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addOptions() {
    // Configured by editorCore.svelte.ts, as in pageLink.ts.
    return {
      resolvePageHref: (_id: string) => '#',
      resolveDocHref: (_id: string) => '#',
    };
  },

  addAttributes() {
    return {
      refType: { default: 'page' }, // 'page' | 'document' | 'url'
      targetPageId: { default: null },
      targetDocId: { default: null },
      url: { default: '' },
      targetSlug: { default: '' },
      label: { default: '' },
      // Unset, not 'link': an absent variant is inferred from the surface, in
      // the editor exactly as on the page.
      variant: {
        default: null,
        parseHTML: (el: HTMLElement) => quickLinkVariantOrNull(el.getAttribute('data-variant')),
        renderHTML: (attrs: Record<string, unknown>) => (quickLinkVariantOrNull(attrs.variant) ? { 'data-variant': attrs.variant } : {}),
      },
      relationshipType: { default: null }, // a relationship_types slug: an opt-in typed edge
      properties: { default: {} }, // only with a relationshipType (collectEdges in graph/graph.server.ts)
      surface: surfaceAttr(),
      typography: typographyAttr(),
      placement: placementAttr(),
      icon: { default: null },
      iconPosition: { default: 'left' }, // 'left' | 'top'
      underline: { default: true },
      blockId: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'a[data-quick-link]' }];
  },

  renderHTML({ HTMLAttributes }) {
    // The clipboard's form; mergeAttributes keeps each attr's own data-* output.
    return ['a', mergeAttributes(HTMLAttributes, { 'data-quick-link': '', href: '#' }), quickLinkLabel(HTMLAttributes)];
  },

  addStorage() {
    return { capabilities: ['surface', 'typography', 'placement'] };
  },

  addNodeView() {
    const options = this.options; // capture at extension-config time
    const editorHref = (a: QuickLinkAttrs) =>
      a.refType === 'url'
        ? safeTargetHref(a.url)
        : a.refType === 'document'
          ? (a.targetDocId ? options.resolveDocHref(a.targetDocId) : '#')
          : (a.targetPageId ? options.resolvePageHref(a.targetPageId) : '#');
    // In the editor every card opens in a new tab, and a plain click selects it.
    return svelteNodeView(QuickLinkCard, {
      wrapper: (node) => quickLinkWrapper(node.attrs as QuickLinkAttrs),
      props: (node, { styles }) => {
        const a = node.attrs as QuickLinkAttrs;
        return quickLinkCardProps(a, editorHref(a), true, false, styles.add(quickLinkCardOverrides(a, getTypographyRegistry(), getBlockDefaults())));
      },
    });
  },
});
