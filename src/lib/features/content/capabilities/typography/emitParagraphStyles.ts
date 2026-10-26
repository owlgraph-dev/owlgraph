// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The paragraph styles as theme-stylesheet rules (docs/architecture/typography.md, "How a
// style is stored and resolved"), lowest first: the body look on every
// typography host, the built-in element looks (so a heading stays one with no
// styles), then one rule per style by `data-ps`. Desktop vars only: a style
// has no tiers. A block's own typography still wins over these rules.
import { BUILTIN_ELEMENT_DEFAULTS, TYPOGRAPHY_ROLE_KEYS, type ElementDefaults, type TypographyRegistry } from './roles';
import { bodyDefaults, type ResolvedParagraphStyle } from './paragraphStyles';
import { PARAGRAPH_STYLE_DATA_ATTR } from './paragraphStyles';
import { resolveFontStack } from './fonts';
import { sizeCss, sizeOrNull } from './typeScale';
import { WEIGHT_PRESETS, familyOrNull, letterSpacingOrNull, lineHeightOrNull, weightOrNull } from './typography';

// The text lands inside a <style> element via {@html}: a value that could
// close the declaration, the rule or the element is rejected.
const UNSAFE_VALUE = /[;{}<>]/;
const STYLE_ID = /^[\w-]+$/;

function lookDeclarations(look: ElementDefaults, customStacks: Record<string, string>): string {
  let body = '';
  const stack = resolveFontStack(familyOrNull(look.family), customStacks);
  if (stack) body += `--typography-family-d:${stack};`;
  body += `--typography-size-d:${sizeCss(sizeOrNull(look.size) ?? 'scale:m')};`;
  const weight = weightOrNull(look.weight);
  if (weight) body += `--typography-weight-d:${WEIGHT_PRESETS[weight]};`;
  const lineHeight = lineHeightOrNull(look.lineHeight);
  if (lineHeight != null) body += `--typography-lineheight-d:${lineHeight};`;
  const letterSpacing = letterSpacingOrNull(look.letterSpacing);
  if (letterSpacing != null) body += `--typography-letterspacing-d:${letterSpacing}em;`;
  if (UNSAFE_VALUE.test(body.replace(/;/g, ''))) throw new Error('Unsafe typography look');
  return body;
}

export function emitParagraphStylesCss(registry: TypographyRegistry): string {
  const stacks = registry.customStacks;
  let css = `.canvas-blocks .cap-typography{${lookDeclarations(bodyDefaults(registry), stacks)}}`;
  for (const role of TYPOGRAPHY_ROLE_KEYS) {
    if (role === 'body' || role === 'display' || role === 'label') continue;
    css += `.canvas-blocks ${role}.cap-typography{${lookDeclarations(BUILTIN_ELEMENT_DEFAULTS[role], stacks)}}`;
  }
  for (const style of registry.paragraphStyles as readonly ResolvedParagraphStyle[]) {
    if (!STYLE_ID.test(style.id)) continue;
    css += `.canvas-blocks .cap-typography[${PARAGRAPH_STYLE_DATA_ATTR}="${style.id}"]{${lookDeclarations(style.defaults, stacks)}}`;
  }
  return css;
}
