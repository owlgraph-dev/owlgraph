// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// What an agent may author, validated at the MCP boundary; the BlockInput
// types are inferred from these shapes. It is the authoring contract, narrower
// than the stored types. The `html` kind is the escape hatch, sanitized at the
// storage boundary (docs/architecture/blocks/overview.md, "Blocks: constrained taxonomy + escape hatch").
import { z } from 'zod';
import { LENGTH_UNITS, PAGE_GROUND_TOKENS, PAGE_GUTTER_BOUNDS, PAGE_WIDTH_BOUNDS, safePageGutter, safePageWidth, type PageWidthKey } from '../page/pageAttrs';
import { columnsByTierShape, containerSurfaceShape, gapByTierShape, minHeightShape, placementShape, spacingShape, surfaceShape, typographyShape } from '../capabilities/inputShapes.server';
import { quickLinkInputShape } from './quickLink/input.server';
import { tableInputShape } from './table/input.server';
import { flexInputShape } from './flex/input.server';
import { collectionInputShape } from './collection/input.server';
import { documentInputShape } from './document/input.server';
import { PLUGIN_INPUT_SHAPES } from '$lib/plugins/inputs.server';

// Re-exported for the MCP tools.
export { columnsByTierShape, containerSurfaceShape, gapByTierShape, minHeightShape, placementShape, spacingShape, surfaceShape, typographyShape };

// Leaf blocks may live at the top level or inside a grid cell.
const leafBlocks = [
  // `style` is validated against the site's styles when the node is built.
  z.object({ kind: z.literal('heading'), level: z.union([z.literal(1), z.literal(2), z.literal(3)]), text: z.string(), style: z.string().optional().describe("A paragraph style id from list_paragraph_styles. It decides the block's element (paragraph or heading level) and look, so it overrides `level`; without it, a heading's level (or the paragraph) uses that element's default style.") }),
  z.object({ kind: z.literal('paragraph'), text: z.string(), style: z.string().optional().describe("A paragraph style id from list_paragraph_styles. It decides the block's element (paragraph or heading level) and look, so it overrides `level`; without it, a heading's level (or the paragraph) uses that element's default style.") }),
  z.object({ kind: z.literal('callout'), variant: z.enum(['info', 'warn', 'tip', 'error']), text: z.string() }),
  z.object({ kind: z.literal('code'), language: z.string().optional(), code: z.string() }),
  // Raw HTML: sanitized at the storage boundary (render/sanitize.server.ts).
  z.object({ kind: z.literal('html'), placement: placementShape, html: z.string().describe("Raw HTML. Before writing CSS of your own, check list_custom_styles: the site's named styles are applied by putting their class on an element (class=\"cs-<slug>\"), they already follow the reader's light or dark scheme, and they keep one look defined in one place. A colour written as a literal here is the same in both schemes."), scheme: z.enum(['light', 'dark']).optional().describe("Pin the block to a colour scheme when its html carries inline colours picked for one: it renders on that scheme's page ground, whatever scheme the page is in.") }),
  quickLinkInputShape,
  z.object({
    kind: z.literal('list'),
    ordered: z.boolean().optional(),
    items: z.array(z.string()),
    listStyle: z
      .enum(['disc', 'circle', 'square', 'none', 'decimal', 'lower-alpha', 'upper-alpha', 'lower-roman', 'upper-roman'])
      .optional(),
    spacing: z.enum(['tight', 'normal', 'loose']).optional(),
  }),
  tableInputShape,
  z.object({ kind: z.literal('diagram'), code: z.string() }),
  collectionInputShape,
  documentInputShape,
  // A tuple, so the union stays static.
  ...PLUGIN_INPUT_SHAPES,
] as const;

export const leafBlockShape = z.discriminatedUnion('kind', [...leafBlocks]);

// Aligned to `cells`. stretch fills the cell both ways and overrides alignX/alignY.
export const cellStyleShape = z.object({
  typography: typographyShape,
  spacing: spacingShape,
  surface: containerSurfaceShape,
  alignX: z.enum(['start', 'center', 'end']).optional(),
  alignY: z.enum(['start', 'center', 'end']).optional(),
  stretch: z.boolean().optional(),
});

export const blockShape = z.discriminatedUnion('kind', [
  ...leafBlocks,
  // Cells hold leaf blocks only: no nested layouts. columnWidths (relative
  // weights) wins over columns; rowHeights are px floors; cells are row-major.
  z.object({
    kind: z.literal('grid'),
    columns: z.number().int().min(1).max(6).optional(),
    columnWidths: z.array(z.number().positive()).min(1).max(6).optional(),
    rowHeights: z.array(z.number().int().positive().max(2000)).max(24).optional(),
    gap: z.enum(['none', 'sm', 'md', 'lg']).optional(),
    columnsByTier: columnsByTierShape,
    gapByTier: gapByTierShape,
    spacing: spacingShape,
    surface: containerSurfaceShape,
    minHeight: minHeightShape,
    width: z.enum(['normal', 'wide', 'full']).optional(),
    placement: placementShape,
    cells: z.array(z.array(leafBlockShape)).min(1),
    cellStyles: z.array(cellStyleShape).optional(),
  }),
  flexInputShape(leafBlockShape),
  // A row of a columns page (docs/architecture/blocks/layout.md, "Page layout: sections"): its
  // cells are padded or merged to the page's column count.
  z.object({
    kind: z.literal('section'),
    cells: z.array(z.array(leafBlockShape)).min(1).max(4),
    width: z.enum(['normal', 'wide', 'full']).optional(),
    columns: z.enum(['template', 'single']).optional(),
    bleedToTop: z.boolean().optional(),
    spacing: spacingShape,
    surface: containerSurfaceShape,
    minHeight: minHeightShape,
    cellStyles: z.array(cellStyleShape).optional(),
  }),
]);

// The page's own settings (page/pageAttrs.ts), for set_page_layout. 'auto'
// clears a setting back to the site's; a field left out stays as it is.
const pageWidthShape = (key: PageWidthKey) =>
  z
    .union([z.literal('auto'), z.string().regex(/^[\d.]+(px|rem)$/, 'a length in px or rem').refine((v) => safePageWidth(key, v) != null, `a length in px or rem, within ${describeBounds(key)}`)])
    .optional();

function describeBounds(key: PageWidthKey): string {
  return LENGTH_UNITS.map((u) => `${PAGE_WIDTH_BOUNDS[key][u].min}–${PAGE_WIDTH_BOUNDS[key][u].max}${u}`).join(' / ');
}

const pageGutterShape = z
  .union([z.literal('auto'), z.string().refine((v) => safePageGutter(v) != null, `a length in px or rem, within ${LENGTH_UNITS.map((u) => `${PAGE_GUTTER_BOUNDS[u].min}–${PAGE_GUTTER_BOUNDS[u].max}${u}`).join(' / ')}`)])
  .optional();

const GAP_ENUM = ['none', 'sm', 'md', 'lg'] as const;
const ratios = z.array(z.number().int().min(1).max(12)).min(1).max(4);

export const pageSettingsShape = {
  layout: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]*$/, 'a page layout id')
    .optional()
    .describe(
      "The page layout: the id of one of the site's page layouts (list_page_layout_presets — 'standard' is the flow, blocks one after another), or 'custom' for a template of the page's own in `columns`. A layout's values are copied into the page, with the layout it came from recorded; a later change to the site's layout never reaches the page, so passing the page's own layout id again re-applies it. Switching from standard wraps every block into one section (first column); switching to standard unwraps the sections in order; a different desktop column count merges or adds columns in every section, never losing content (the result says what merged)."
    ),
  columns: z
    .object({ desktop: ratios, tablet: ratios.optional(), phone: ratios.optional() })
    .optional()
    .describe(
      "The column template: whole-number proportions per tier, e.g. { desktop: [2, 1], tablet: [2, 1], phone: [1] }. With layout 'custom' it is the page's own; given alone (or with a layout id) it adjusts the page's current layout, which then differs from the layout it came from. A smaller tier never has more columns than a larger one; a missing tier takes the one above. Every section has as many cells as the desktop tier has columns."
    ),
  columnGap: z
    .object({ desktop: z.enum(GAP_ENUM).optional(), tablet: z.enum(GAP_ENUM).optional(), phone: z.enum(GAP_ENUM).optional() })
    .optional()
    .describe("The gap between a columns page's columns per tier ('none' | 'sm' | 'md' | 'lg'); an unset tier takes the one above, then 'md'."),
  readWidth: pageWidthShape('read').describe(
    "The page's reading column: how wide text and every block without a section width of its own get (e.g. '880px', '55rem'). 'auto' = the site's reading width (its capability defaults)."
  ),
  wideWidth: pageWidthShape('wide').describe(
    "How wide sections with width 'wide' get on this page (never narrower than the reading column). 'auto' = the site's wide width."
  ),
  gutters: z
    .object({ desktop: pageGutterShape, tablet: pageGutterShape, phone: pageGutterShape })
    .optional()
    .describe(
      "The page's side margin per tier: the space between the page edge and its content, and the side padding of sections set to width 'full' (e.g. { phone: '12px' }). Each tier stands alone: 'auto' = the site's margin for that tier (desktop 40 / tablet 24 / phone 16 px unless the site moved them)."
    ),
  background: z
    .enum(['auto', ...PAGE_GROUND_TOKENS.map((t) => `token:${t}` as const)] as [string, ...string[]])
    .optional()
    .describe("The whole page's background, a theme colour that follows every colour scheme. 'auto' = the content palette's page ground."),
  blockSpace: z
    .union([z.literal('auto'), z.number().int().min(0).max(200)])
    .optional()
    .describe("The page's block rhythm, px: the space above every block that sets none of its own. 'auto' = the site's page rhythm."),
};
