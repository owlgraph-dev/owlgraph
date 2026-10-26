// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// A NodeView with no component, for a container whose block element is its
// content element (the query block's result container).
import type { Node as PMNode } from '@tiptap/pm/model';
import type { NodeViewRenderer } from '@tiptap/core';
import { getLiveStyles } from '../../capabilities/liveStyles';
import { applyWrapper, type BlockWrapper } from './blockWrapper';

export function wrapperNodeView(opts: { wrapper: (node: PMNode) => BlockWrapper; tag?: keyof HTMLElementTagNameMap }): NodeViewRenderer {
  return ({ node }) => {
    const styles = getLiveStyles();
    if (!styles) throw new Error('wrapperNodeView: no live stylesheet — editorCore.mount registers one before the editor is built');
    let current = node;
    const dom: HTMLElement = document.createElement(opts.tag ?? 'div');
    applyWrapper(dom, opts.wrapper(node), styles);
    return {
      dom,
      contentDOM: dom,
      update(next) {
        if (next.type !== current.type) return false;
        // A container's update also comes for every change of its content, with the same attrs object.
        if (next.attrs !== current.attrs) applyWrapper(dom, opts.wrapper(next), styles);
        current = next;
        return true;
      },
    };
  };
}
