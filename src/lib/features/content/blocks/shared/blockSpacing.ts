// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The editor half of `spaceAbove` for the registry's `spaced` kinds. A NodeView
// ignores renderHTML, so a NodeView block applies the var itself, and each
// block's render.ts emits it on the page.
import { Extension } from '@tiptap/core';
import { spacingAttr, spaceAboveStyle, type SpacingData } from '../../capabilities/spacing/spacing';
import { GLOBAL_SPACING_TYPES } from '../catalog';

export const BlockSpacing = Extension.create({
  name: 'blockSpacing',
  addGlobalAttributes() {
    return [
      {
        types: [...GLOBAL_SPACING_TYPES],
        attributes: {
          spacing: {
            ...spacingAttr(),
            // `data-spacing` survives copy/paste; `style` renders it, merged per
            // declaration with the block's own vars.
            renderHTML: (attrs: Record<string, unknown>) => {
              const spacing = attrs.spacing as SpacingData | undefined;
              const out: Record<string, string> = {};
              if (spacing && Object.keys(spacing).length) out['data-spacing'] = JSON.stringify(spacing);
              const style = spaceAboveStyle({ spacing });
              if (style) out.style = style;
              return out;
            },
          },
        },
      },
    ];
  },
});
