// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// A link to a document, its own mark beside pageLink. It resolves to the
// document viewer, since documents have no editor view.
import { Mark, mergeAttributes } from '@tiptap/core';

export const DocLink = Mark.create({
  name: 'docLink',
  inclusive: false,

  addOptions() {
    // Configured by editorCore.svelte.ts, like pageLink's.
    return { resolveHref: (_id: string) => '#' };
  },

  addAttributes() {
    return {
      targetDocId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-doc-id'),
        renderHTML: (attrs) => (attrs.targetDocId ? { 'data-doc-id': attrs.targetDocId } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'a[data-doc-link]' }];
  },

  renderHTML({ HTMLAttributes }) {
    // A click places the cursor; Ctrl/Cmd-click opens a new tab (editorCore.svelte.ts).
    const id = HTMLAttributes['data-doc-id'] ?? '';
    return ['a', mergeAttributes(HTMLAttributes, { 'data-doc-link': '', class: 'doc-link', href: id ? this.options.resolveHref(id) : '#' }), 0];
  },
});
