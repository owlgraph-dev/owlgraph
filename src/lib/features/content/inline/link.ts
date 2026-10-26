// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// A plain web link, written by the API (its href checked on every write,
// sanitize.server.ts) and never created in the editor, which only keeps it so
// such a page still loads. It parses only its own output: a pasted link stays
// plain text.
import { Mark, mergeAttributes } from '@tiptap/core';
import { safeLinkHref } from '../render/linkHref';

export const LinkMark = Mark.create({
  name: 'link',
  inclusive: false,

  addAttributes() {
    return {
      href: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-href'),
        renderHTML: (attrs) => (attrs.href ? { 'data-href': attrs.href } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'a[data-owl-link]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['a', mergeAttributes(HTMLAttributes, { 'data-owl-link': '', href: safeLinkHref(HTMLAttributes['data-href']), rel: 'noopener noreferrer nofollow' }), 0];
  },
});
