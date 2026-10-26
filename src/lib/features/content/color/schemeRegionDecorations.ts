// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The renderer's scheme attributes as node decorations, which reach a block's
// outermost element through renderHTML and NodeViews alike. Recomputed on every
// change: a scheme region depends on its ancestors' backgrounds too.
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as PmNode } from '@tiptap/pm/model';
import { groundStep, schemeAttributes, pageGrounds, type Grounds } from './schemeRegions';

export function schemeRegionDecorations(doc: PmNode): DecorationSet {
  const decorations: Decoration[] = [];
  const visit = (node: PmNode, pos: number, outer: Grounds) => {
    const step = groundStep({ type: node.type.name, attrs: node.attrs }, outer);
    const attrs = schemeAttributes(step);
    if (Object.keys(attrs).length) decorations.push(Decoration.node(pos, pos + node.nodeSize, attrs));
    if (node.isTextblock || node.isLeaf) return;
    node.forEach((child, offset) => visit(child, pos + 1 + offset, step.inner));
  };
  const page = pageGrounds(doc.attrs);
  doc.forEach((child, offset) => visit(child, offset, page));
  return DecorationSet.create(doc, decorations);
}

const key = new PluginKey<DecorationSet>('schemeRegions');

export const SchemeRegions = Extension.create({
  name: 'schemeRegions',
  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key,
        state: {
          init: (_config, state) => schemeRegionDecorations(state.doc),
          apply: (tr, previous) => (tr.docChanged ? schemeRegionDecorations(tr.doc) : previous),
        },
        props: {
          decorations: (state) => key.getState(state),
        },
      }),
    ];
  },
});
