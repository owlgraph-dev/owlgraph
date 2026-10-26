// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Inline typography: one mark per field, not one combined mark, because
// setMark() replaces a mark's whole attrs per range segment, so changing one
// field would clobber the others. Marks have no responsive cascade and no
// style default: they override whatever the enclosing block resolved. The
// editor must register them, or a loaded doc drops them.
import { Mark, mergeAttributes, type Editor } from '@tiptap/core';
import { safeColor } from '../parse';
import { colorCss } from '../../color/colorTokens';
import { WEIGHT_PRESETS, familyOrNull, weightOrNull, lineHeightOrNull, letterSpacingOrNull, type WeightToken } from './typography';
import { sizeCss, sizeOrNull, type TypeSize } from './typeScale';
import { resolveFontStack } from './fonts';
import { getTypographyRegistry } from './typographyRegistry';
import { markFieldState } from '../../blocks/shared/markFieldState';

export const TypographyFamilyMark = Mark.create({
  name: 'typographyFamily',
  inclusive: false,

  addAttributes() {
    return {
      family: {
        default: null,
        parseHTML: (el) => familyOrNull(el.getAttribute('data-typo-family')),
        renderHTML: (attrs) => (attrs.family ? { 'data-typo-family': attrs.family } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-typo-family]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const family = familyOrNull(HTMLAttributes['data-typo-family']);
    const stack = resolveFontStack(family, getTypographyRegistry().customStacks);
    const style = stack ? `font-family:${stack}` : '';
    return ['span', mergeAttributes(HTMLAttributes, style ? { style } : {}), 0];
  },
});

export const TypographySizeMark = Mark.create({
  name: 'typographySize',
  inclusive: false,

  addAttributes() {
    return {
      size: {
        default: null,
        parseHTML: (el) => sizeOrNull(el.getAttribute('data-typo-size')),
        renderHTML: (attrs) => (attrs.size != null ? { 'data-typo-size': String(attrs.size) } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-typo-size]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const size = sizeOrNull(HTMLAttributes['data-typo-size']);
    const style = size != null ? `font-size:${sizeCss(size)}` : '';
    return ['span', mergeAttributes(HTMLAttributes, style ? { style } : {}), 0];
  },
});

export const TypographyColorMark = Mark.create({
  name: 'typographyColor',
  inclusive: false,

  addAttributes() {
    return {
      color: {
        default: null,
        parseHTML: (el) => safeColor(el.getAttribute('data-typo-color')) || null,
        renderHTML: (attrs) => (attrs.color ? { 'data-typo-color': attrs.color } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-typo-color]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const color = safeColor(HTMLAttributes['data-typo-color']);
    const style = color ? `color:${colorCss(color)}` : '';
    return ['span', mergeAttributes(HTMLAttributes, style ? { style } : {}), 0];
  },
});

export const TypographyWeightMark = Mark.create({
  name: 'typographyWeight',
  inclusive: false,

  addAttributes() {
    return {
      weight: {
        default: null,
        parseHTML: (el) => weightOrNull(el.getAttribute('data-typo-weight')),
        renderHTML: (attrs) => (attrs.weight ? { 'data-typo-weight': attrs.weight } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-typo-weight]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const weight = weightOrNull(HTMLAttributes['data-typo-weight']);
    const style = weight ? `font-weight:${WEIGHT_PRESETS[weight]}` : '';
    return ['span', mergeAttributes(HTMLAttributes, style ? { style } : {}), 0];
  },
});

export const TypographyLineHeightMark = Mark.create({
  name: 'typographyLineHeight',
  inclusive: false,

  addAttributes() {
    return {
      lineHeight: {
        default: null,
        parseHTML: (el) => {
          const raw = Number(el.getAttribute('data-typo-line-height'));
          return Number.isFinite(raw) ? lineHeightOrNull(raw) : null;
        },
        renderHTML: (attrs) => (attrs.lineHeight != null ? { 'data-typo-line-height': String(attrs.lineHeight) } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-typo-line-height]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const raw = Number(HTMLAttributes['data-typo-line-height']);
    const lineHeight = Number.isFinite(raw) ? lineHeightOrNull(raw) : null;
    const style = lineHeight != null ? `line-height:${lineHeight}` : '';
    return ['span', mergeAttributes(HTMLAttributes, style ? { style } : {}), 0];
  },
});

export const TypographyLetterSpacingMark = Mark.create({
  name: 'typographyLetterSpacing',
  inclusive: false,

  addAttributes() {
    return {
      letterSpacing: {
        default: null,
        parseHTML: (el) => {
          const raw = Number(el.getAttribute('data-typo-letter-spacing'));
          return Number.isFinite(raw) ? letterSpacingOrNull(raw) : null;
        },
        renderHTML: (attrs) => (attrs.letterSpacing != null ? { 'data-typo-letter-spacing': String(attrs.letterSpacing) } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-typo-letter-spacing]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const raw = Number(HTMLAttributes['data-typo-letter-spacing']);
    const letterSpacing = Number.isFinite(raw) ? letterSpacingOrNull(raw) : null;
    const style = letterSpacing != null ? `letter-spacing:${letterSpacing}em` : '';
    return ['span', mergeAttributes(HTMLAttributes, style ? { style } : {}), 0];
  },
});

export interface MarkFieldValue {
  family: string | null;
  size: TypeSize | null;
  color: string | null;
  weight: WeightToken | null;
  lineHeight: number | null;
  letterSpacing: number | null;
}
export interface MarkFieldMixed {
  family: boolean;
  size: boolean;
  color: boolean;
  weight: boolean;
  lineHeight: boolean;
  letterSpacing: boolean;
}

const FIELD_MARKS: { field: keyof MarkFieldValue; mark: string; attr: string }[] = [
  { field: 'family', mark: 'typographyFamily', attr: 'family' },
  { field: 'size', mark: 'typographySize', attr: 'size' },
  { field: 'color', mark: 'typographyColor', attr: 'color' },
  { field: 'weight', mark: 'typographyWeight', attr: 'weight' },
  { field: 'lineHeight', mark: 'typographyLineHeight', attr: 'lineHeight' },
  { field: 'letterSpacing', mark: 'typographyLetterSpacing', attr: 'letterSpacing' },
];

// Each field's value and whether the selection mixes several.
export function getMarkFieldStates(editor: Editor): { value: MarkFieldValue; mixed: MarkFieldMixed } {
  const { from, to } = editor.state.selection;
  const value: any = {};
  const mixed: any = {};
  for (const { field, mark, attr } of FIELD_MARKS) {
    const s = markFieldState(editor, from, to, mark, attr);
    value[field] = s.value;
    mixed[field] = s.mixed;
  }
  return { value, mixed };
}
