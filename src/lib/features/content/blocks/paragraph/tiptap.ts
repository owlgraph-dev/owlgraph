// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Tiptap's Paragraph with the Typography capability and a paragraph style.
import { mergeAttributes } from '@tiptap/core';
import { Paragraph as TiptapParagraph } from '@tiptap/extension-paragraph';
import { typographyAttr, typographyVars } from '../../capabilities/typography/typography';
import { typographyRoleAttr } from '../../capabilities/typography/roles';
import { PARAGRAPH_STYLE_DATA_ATTR, paragraphStyleAttr, resolveParagraphStyle } from '../../capabilities/typography/paragraphStyles';
import { getTypographyRegistry } from '../../capabilities/typography/typographyRegistry';
import { styleAttr } from '../../capabilities/overrides';

export const Paragraph = TiptapParagraph.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      typography: typographyAttr(),
      // Unset resolves the default paragraph style.
      paragraphStyle: paragraphStyleAttr(),
      // Stored content may carry it; nothing sets it (capabilities/typography/roles.ts).
      typographyRole: typographyRoleAttr(),
    };
  },

  renderHTML({ node, HTMLAttributes }) {
    const registry = getTypographyRegistry();
    // The style's look is a theme stylesheet rule; only the block's own deviations go inline.
    const { style: paragraphStyle, defaults } = resolveParagraphStyle('paragraph', node.attrs, registry.paragraphStyles);
    const style = styleAttr(typographyVars(node.attrs.typography, defaults, 'typography', registry));
    return [
      'p',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        class: 'cap-typography',
        ...(paragraphStyle ? { [PARAGRAPH_STYLE_DATA_ATTR]: paragraphStyle.id } : {}),
        ...(style ? { style } : {}),
      }),
      0,
    ];
  },

  addStorage() {
    return { capabilities: ['typography'] };
  },
});
