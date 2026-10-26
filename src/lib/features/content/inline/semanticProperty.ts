// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// A named property on a run of text: the text is the value, the name lives on
// the mark (agents write `{{{name:value}}}`, parsed in parseInline). The page
// renders a machine-readable <span data-prop>. In a query template, a
// `parameter:` propName makes it a parameter, and `paramType` declares the
// slot's expected datatype for the mapping; null on ordinary properties.
import { Mark, mergeAttributes } from '@tiptap/core';
import { isParameterName, parameterLocalName } from '$lib/features/semantic';

export const SemanticProperty = Mark.create({
  name: 'semanticProperty',
  inclusive: false,

  addOptions() {
    // Injected by the editor, so the pill shows a label without storing one.
    return { getLabel: null as ((name: string) => string | null) | null };
  },

  addAttributes() {
    return {
      propName: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-prop') ?? '',
        renderHTML: (attrs) => ({ 'data-prop': attrs.propName ?? '' }),
      },
      paramType: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-param-type') || null,
        renderHTML: (attrs) => (attrs.paramType ? { 'data-param-type': attrs.paramType } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-prop]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const name = HTMLAttributes['data-prop'] ?? '';
    // A parameter pill shows only the local name, tinted apart from a property.
    if (isParameterName(name)) {
      return ['span', mergeAttributes(HTMLAttributes, { class: 'sem-prop sem-param', 'data-label': parameterLocalName(name) }), 0];
    }
    const label = (this.options.getLabel && this.options.getLabel(name)) || name;
    return ['span', mergeAttributes(HTMLAttributes, { class: 'sem-prop', 'data-label': label }), 0];
  },
});
