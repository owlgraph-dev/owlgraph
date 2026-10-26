// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// A link from a run of text to another page. The editor must register it, or
// a loaded doc drops the links agents wrote.
import { Mark, mergeAttributes } from '@tiptap/core';

export const PageLink = Mark.create({
  name: 'pageLink',
  inclusive: false,

  addOptions() {
    // editorCore.svelte.ts configures the real resolver; the default keeps the
    // extension valid on its own.
    return { resolveHref: (_id: string) => '#' };
  },

  addAttributes() {
    return {
      targetPageId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-page-id'),
        renderHTML: (attrs) => (attrs.targetPageId ? { 'data-page-id': attrs.targetPageId } : {}),
      },
      targetSlug: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-slug') ?? '',
        renderHTML: (attrs) => ({ 'data-slug': attrs.targetSlug ?? '' }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'a[data-page-link]' }];
  },

  renderHTML({ HTMLAttributes }) {
    // Resolved fresh from the id, not a stored slug, so a rename never leaves a
    // stale href. A click places the cursor and Ctrl/Cmd-click opens a new tab
    // (editorCore.svelte.ts): target="_blank" can't, as ProseMirror suppresses
    // the native click on inline marks.
    const id = HTMLAttributes['data-page-id'] ?? '';
    return ['a', mergeAttributes(HTMLAttributes, { 'data-page-link': '', class: 'page-link', href: id ? this.options.resolveHref(id) : '#' }), 0];
  },
});
