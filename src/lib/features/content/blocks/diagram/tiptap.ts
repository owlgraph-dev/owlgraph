// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The source is edited through the selected-block overlay ("Edit block"),
// like the HTML block's.
import { Node } from '@tiptap/core';
import * as m from '$lib/paraglide/messages';
import { svelteNodeView } from '../scaffold/svelteNodeView.svelte';
import { diagramProps, diagramWrapper } from './view';
import DiagramView from './Diagram.svelte';

export const Diagram = Node.create({
  name: 'diagram',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      code: { default: '' },
      blockId: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-diagram]' }];
  },

  renderHTML() {
    return ['div', { 'data-diagram': '' }];
  },

  // Display only: a click selects it, for the overlay's actions.
  addNodeView() {
    return svelteNodeView(DiagramView, {
      wrapper: (node) => diagramWrapper(node.attrs),
      props: (node) =>
        diagramProps(node.attrs, { waiting: m.diagram_block_state_waiting(), failed: m.diagram_block_state_error(), empty: m.diagram_block_state_empty() }),
    });
  },
});
