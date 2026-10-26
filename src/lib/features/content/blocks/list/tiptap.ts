// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// List marker and item spacing as global attributes, so StarterKit's list
// nodes stay as they are. Values are allowlisted in listStyle.ts.
import { Extension } from '@tiptap/core';
import { safeListTypeAny, listGap } from './listStyle';

export const ListFormatting = Extension.create({
  name: 'listFormatting',
  addGlobalAttributes() {
    return [
      {
        types: ['bulletList', 'orderedList'],
        attributes: {
          listStyle: {
            default: null,
            parseHTML: (el) => el.getAttribute('data-list-style'),
            renderHTML: (attrs) => {
              const v = safeListTypeAny(attrs.listStyle);
              return v ? { 'data-list-style': v, style: `list-style-type:${v}` } : {};
            },
          },
          spacing: {
            default: null,
            parseHTML: (el) => el.getAttribute('data-spacing'),
            renderHTML: (attrs) => {
              const g = listGap(attrs.spacing);
              return g ? { 'data-spacing': attrs.spacing, style: `--list-gap:${g}` } : {};
            },
          },
        },
      },
    ];
  },
});
