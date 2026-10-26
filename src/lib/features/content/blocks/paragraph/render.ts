// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The paragraph style's look is a theme stylesheet rule; only the block's own deviations are emitted.
import { attrsOf } from '../../doc/doc';
import type { ParagraphAttrs } from './model';
import { typographyVars } from '../../capabilities/typography/typography';
import { paragraphStyleAttribute, resolveParagraphStyle } from '../../capabilities/typography/paragraphStyles';
import { mergeOverrides } from '../../capabilities/overrides';
import { blockIdAttribute, overrideAttribute, type BlockRenderer } from '../blockRenderer';
import { spaceAboveOverrides } from '../../capabilities/spacing/spacing';

export const renderParagraph: BlockRenderer = (node, ctx) => {
  const a = attrsOf<ParagraphAttrs>(node);
  const { style: paragraphStyle, defaults } = resolveParagraphStyle('paragraph', a as Record<string, unknown>, ctx.registry.paragraphStyles);
  const style = overrideAttribute(ctx, mergeOverrides(typographyVars(a.typography, defaults, 'typography', ctx.registry), spaceAboveOverrides(a)));
  return `<p class="cap-typography"${blockIdAttribute(node)}${paragraphStyleAttribute(paragraphStyle)}${style}>${ctx.renderInline(node.content)}</p>`;
};
