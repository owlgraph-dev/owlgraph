// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The HTML block's schema and NodeView (docs/architecture/blocks/anatomy.md). The
// stored html is sanitized on save (render/sanitize.server.ts, the boundary);
// the NodeView sanitizes too, since an applied edit renders before any save.
import { Node } from '@tiptap/core';
import * as m from '$lib/paraglide/messages';
import { pinnedScheme } from '../../color/contentScheme';
import { placementAttr } from '../../capabilities/placement/placement';
import { svelteNodeView } from '../scaffold/svelteNodeView.svelte';
import { sanitizeHtmlBlockPreview } from './htmlBlockSanitize';
import { htmlBlockProps, htmlBlockWrapper } from './view';
import HtmlBlockView from './HtmlBlock.svelte';

export const HtmlBlock = Node.create({
  name: 'htmlBlock',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      html: { default: '' },
      blockId: { default: null },
      placement: placementAttr(),
      scheme: {
        default: null,
        parseHTML: (el: HTMLElement) => pinnedScheme(el.getAttribute('data-scheme')),
        renderHTML: (attrs: Record<string, unknown>) => {
          const scheme = pinnedScheme(attrs.scheme);
          return scheme ? { 'data-scheme': scheme } : {};
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-html-block]' }];
  },

  renderHTML() {
    return ['div', { 'data-html-block': '' }];
  },

  addStorage() {
    return { capabilities: ['placement'] };
  },

  // Display only: a click selects it, so the overlay's Edit action is reachable.
  addNodeView() {
    return svelteNodeView(HtmlBlockView, {
      wrapper: (node) => htmlBlockWrapper(node.attrs),
      props: (node) => htmlBlockProps(sanitizeHtmlBlockPreview(String(node.attrs.html ?? '')), m.editor_html_block_empty()),
    });
  },
});
