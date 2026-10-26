// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { esc } from '$lib/platform/htmlEscape';
import { attrsOf } from '../../doc/doc';
import { blockIdAttribute, spaceAboveAttribute, type BlockRenderer } from '../blockRenderer';

export interface CalloutAttrs {
  variant?: string;
}

export const renderCallout: BlockRenderer = (node, ctx) => {
  const a = attrsOf<CalloutAttrs>(node);
  return `<div class="callout callout-${esc(a.variant ?? 'info')}"${blockIdAttribute(node)}${spaceAboveAttribute(node, ctx)}>${ctx.renderInline(node.content)}</div>`;
};
