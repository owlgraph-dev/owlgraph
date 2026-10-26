// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The page canvas, in every view of a page. Its geometry is the site's width
// and gutter tokens (set in the capability defaults), which app.css turns into
// --canvas-* vars; what a page sets for itself (pageAttrs.ts) lands on the canvas
// as a sparse override set. A first block with bleedToTop suppresses the top
// padding (.bleed-top in app.css).
import { flowRhythmVars } from '../capabilities/spacing/spacing';
import { pageRhythmPx } from '../capabilities/defaults/blockDefaults';
import { getBlockDefaults } from '../capabilities/defaults/defaultsRegistry';
import { mergeOverrides, styleAttr, type OverrideSet } from '../capabilities/overrides';
import { pageColumnsOf, pageGroundCss, pageGutter, pageWidth, type PageAttrs } from './pageAttrs';
import { pageColumnsVars } from './pageColumns';

/** The page's ground as an override: `--page-bg`, read by the canvas and by the reading area around it. */
export function pageGroundOverrides(page?: Partial<PageAttrs> | null): OverrideSet {
  const ground = pageGroundCss(page?.surface);
  return ground ? { '--page-bg': ground } : {};
}

// A document that pins exactly the theme's page rhythm emits none of its own.
// `pageRhythm` defaults to the browser registry's; server render paths pass it.
export function pageCanvasOverrides(page?: Partial<PageAttrs> | null, pageRhythm: number = pageRhythmPx(getBlockDefaults())): OverrideSet {
  const widths: Record<string, string> = {};
  const read = pageWidth(page?.layout, 'read');
  if (read) widths['--canvas-read'] = read;
  const wide = pageWidth(page?.layout, 'wide');
  if (wide) widths['--canvas-wide'] = wide;
  for (const [bp, tier] of [['desktop', 'd'], ['tablet', 't'], ['phone', 'p']] as const) {
    const gutter = pageGutter(page?.layout, bp);
    if (gutter) widths[`--canvas-gutter-${tier}`] = gutter;
  }
  return mergeOverrides(widths, pageColumnsVars(pageColumnsOf(page?.layout)), pageGroundOverrides(page), flowRhythmVars(page?.spacing, pageRhythm));
}

/** The `style` text of pageCanvasOverrides — the editor canvases' carrier. */
export function pageCanvasVars(page?: Partial<PageAttrs> | null, pageRhythm?: number): string {
  return styleAttr(pageCanvasOverrides(page, pageRhythm));
}

export function pageCanvasClass(firstBlockBleeds: boolean): string {
  return firstBlockBleeds ? 'page-canvas bleed-top' : 'page-canvas';
}

// Takes a (type, attrs) pair so a JSON node and a live ProseMirror node both work.
const BLEED_CAPABLE_TYPES = new Set(['grid', 'flexContainer', 'queryBlock', 'pageSection']);

export function computeFirstBlockBleeds(
  firstNodeType: string | null | undefined,
  firstNodeAttrs: Record<string, unknown> | null | undefined
): boolean {
  if (!firstNodeType || !BLEED_CAPABLE_TYPES.has(firstNodeType)) return false;
  return firstNodeAttrs?.bleedToTop === true;
}
