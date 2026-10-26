// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// How an HTML block's attrs become what is drawn, shared by the editor and the page.
import { spaceAboveOverrides } from '../../capabilities/spacing/spacing';
import { mergeOverrides } from '../../capabilities/overrides';
import { placementClass, placementVars } from '../../capabilities/placement/placement';
import { pinnedScheme } from '../../color/contentScheme';
import type { BlockWrapper } from '../scaffold/blockWrapper';
import type { HtmlBlockAttrs } from './model';

/** The block's own element, always there; the authored markup is its children. */
export function htmlBlockWrapper(attrs: HtmlBlockAttrs | undefined): BlockWrapper {
  return {
    classes: ['html-block', placementClass(attrs?.placement, 'box')].filter(Boolean),
    blockId: attrs?.blockId ?? null,
    attrs: { 'data-html-block': '', 'data-scheme': pinnedScheme(attrs?.scheme) },
    overrides: mergeOverrides(spaceAboveOverrides(attrs), placementVars(attrs?.placement, 'box')),
  };
}

/**
 * `html` must already be sanitized (on the page after a query template's
 * substitution). `empty` is the editor's hint for an empty block, null on the page.
 */
export function htmlBlockProps(html: string, empty: string | null) {
  return { html, empty };
}
