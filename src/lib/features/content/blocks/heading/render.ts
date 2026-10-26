// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The paragraph style's look is a theme stylesheet rule; only the block's own
// deviations are emitted. The level is the tag, whatever the style says.
import { attrsOf } from '../../doc/doc';
import type { HeadingAttrs } from './model';
import { typographyVars } from '../../capabilities/typography/typography';
import { paragraphStyleAttribute, resolveParagraphStyle } from '../../capabilities/typography/paragraphStyles';
import { mergeOverrides } from '../../capabilities/overrides';
import { blockIdAttribute, overrideAttribute, type BlockRenderer } from '../blockRenderer';
import { spaceAboveOverrides } from '../../capabilities/spacing/spacing';

export const renderHeading: BlockRenderer = (node, ctx) => {
  const a = attrsOf<HeadingAttrs>(node);
  const l = Math.min(Math.max(a.level ?? 2, 1), 6);
  const { style: paragraphStyle, defaults } = resolveParagraphStyle('heading', { ...a, level: l }, ctx.registry.paragraphStyles);
  const style = overrideAttribute(ctx, mergeOverrides(typographyVars(a.typography, defaults, 'typography', ctx.registry), spaceAboveOverrides(a)));
  return `<h${l} class="cap-typography"${blockIdAttribute(node)}${paragraphStyleAttribute(paragraphStyle)}${style}>${ctx.renderInline(node.content)}</h${l}>`;
};
