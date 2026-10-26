// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// A named style on a run of text (docs/architecture/custom-styles.md). The attribute is the
// style's stable id, never its class: the class is looked up at render time,
// so a rename breaks nothing, and since API writes don't validate marks, a
// class can never arrive from content. An unknown id renders unstyled.
import { Mark, mergeAttributes } from '@tiptap/core';
import { customStyleClass } from './customStyleRegistry';

export const CustomStyle = Mark.create({
  name: 'customStyle',
  // Typing on at the end of a styled run doesn't extend it.
  inclusive: false,

  addAttributes() {
    return {
      styleId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-style-id'),
        renderHTML: (attrs) => (attrs.styleId ? { 'data-style-id': attrs.styleId } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-style-id]' }];
  },

  renderHTML({ HTMLAttributes }) {
    // data-style-id lets copy/paste in the canvas round-trip into a mark; the
    // public render emits the class alone.
    const className = customStyleClass(HTMLAttributes['data-style-id'] as string | null);
    return ['span', mergeAttributes(HTMLAttributes, className ? { class: className } : {}), 0];
  },
});
