// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The capability data an agent may pass when it authors a block: the zod
// shapes blockInputSchema.server.ts and each block's input.server.ts build on.
// Narrower than the stored types: this is the authoring contract.
import { z } from 'zod';
import { CONTENT_COLOR_TOKENS } from '../color/colorTokens';
import { SIZE_MAX, SIZE_MIN, TYPE_SCALE_REFS, TYPE_SCALE_STEPS } from './typography/typeScale';
import { MIN_HEIGHT_BOUNDS, MIN_HEIGHT_NONE, MIN_HEIGHT_UNITS, normalizeHeightData, parseMinHeight, type HeightData } from './height/height';
import { GAP_MAX, GAP_MIN } from './layout/layout';
import { FLEX_BASIS_BOUNDS, FLEX_BASIS_UNITS, parseFlexBasis } from './flexItem/flexItem';

const px = z.number().min(0).max(200).optional();
const spacingValueShape = z.object({
  pad: px.describe("Padding on all four sides, px. Omit for Auto: the site's block default for this block-type group."),
  top: px,
  right: px,
  bottom: px,
  left: px,
  blockSpace: px.describe("The rhythm the blocks INSIDE this flow (a container, a cell, the page) put above themselves, px. Omit for Auto: the ancestor flow's rhythm, then the site's page rhythm."),
  spaceAbove: px.describe("This block's own space above it, px — a one-off break of the rhythm. Omit for Auto: the block type's default share of the rhythm."),
});
export const spacingShape = z
  .object({
    desktop: spacingValueShape.optional(),
    tablet: spacingValueShape.optional(),
    phone: spacingValueShape.optional(),
  })
  .optional()
  .describe("Spacing, grouped by tier (tablet and phone override desktop field by field). Every field you omit stays Auto — the site's block defaults apply — so set only what should deviate.");

// Validated server-side by safeColor.
const colorShape = z
  .string()
  .describe(
    `A colour: a theme colour 'token:<name>' (${CONTENT_COLOR_TOKENS.join(', ')}), which follows the reader's light or dark scheme; a site brand colour 'token:brand.<id>' (list_brand_colors), which does too; or a fixed hex/rgb/rgba literal, the same in both.`
  );

const surfaceValueShape = z.object({
  bg: colorShape.optional(),
  border: colorShape.optional(),
  radius: z.number().min(0).max(60).optional(),
  shadow: z.enum(['none', 'sm', 'md', 'lg']).optional(),
});
export const surfaceShape = z
  .object({
    desktop: surfaceValueShape.optional(),
    tablet: surfaceValueShape.optional(),
    phone: surfaceValueShape.optional(),
  })
  .optional()
  .describe("Surface, grouped by tier. A field you omit stays Auto — the site's block defaults for this block-type group (its corners, shadow, border, background) apply and follow the theme — so set only what should deviate.");

// Only a container, section or cell takes an image layer, never a card or a result.
const containerSurfaceValueShape = surfaceValueShape.extend({
  image: z
    .string()
    .uuid()
    .optional()
    .describe("A background image: the asset id of an image uploaded to THIS page in the editor (get_page shows the ids its blocks use). Agents cannot upload; an id owned by another page is refused. bg stays as the colour shown while it loads and around a contained image."),
  imageFit: z.enum(['cover', 'contain', 'repeat']).optional().describe("How the image fills the block: 'cover' (default, cropped to fill), 'contain' (whole image, bg around it) or 'repeat' (tiled)."),
  imageFocus: z
    .enum(['center', 'top', 'bottom', 'left', 'right', 'top-left', 'top-right', 'bottom-left', 'bottom-right'])
    .optional()
    .describe("The part of the image that stays in view when it is cropped. Default 'center'."),
  overlay: colorShape.optional().describe("A colour laid over the image so text on it reads — e.g. 'token:inverse', or a fixed dark literal. It also decides the block's colour scheme (imageScheme Auto): a dark overlay gives light text."),
  overlayOpacity: z.number().int().min(0).max(100).optional().describe("The overlay's opacity in percent. Default 50."),
  imageScheme: z
    .enum(['light', 'dark'])
    .optional()
    .describe("The colour scheme the block's text renders in on the image. Omit for Auto: decided from the overlay; with no overlay the block keeps its surroundings' scheme — and nothing guarantees text reads on the photo, so set an overlay or a scheme."),
});
export const containerSurfaceShape = z
  .object({
    desktop: containerSurfaceValueShape.optional(),
    tablet: containerSurfaceValueShape.optional(),
    phone: containerSurfaceValueShape.optional(),
  })
  .optional()
  .describe(
    "Surface, grouped by tier (tablet and phone override desktop field by field). A field you omit stays Auto — the site's block defaults apply — so set only what should deviate. A background image may differ per tier (e.g. a portrait crop on phone); a tier may also change only its focus point."
  );

const minHeightValue = z
  .string()
  .refine((v) => v === MIN_HEIGHT_NONE || parseMinHeight(v) != null, {
    message: `a length within ${MIN_HEIGHT_UNITS.map((u) => `${MIN_HEIGHT_BOUNDS[u].min}–${MIN_HEIGHT_BOUNDS[u].max}${u}`).join(' / ')}, or 'none'`,
  })
  .optional();
export const minHeightShape = z
  .object({ desktop: minHeightValue, tablet: minHeightValue, phone: minHeightValue })
  .optional()
  .describe(
    `The block's minimum height per tier — a hero's height (tablet and phone inherit the larger tier): a length in px, rem or svh (${MIN_HEIGHT_UNITS.map((u) => `${MIN_HEIGHT_BOUNDS[u].min}–${MIN_HEIGHT_BOUNDS[u].max}${u}`).join(' / ')}), e.g. { desktop: '640px', phone: '80svh' }. svh is a share of the screen's height; prefer it to a viewport unit. 'none' on tablet or phone takes back a larger tier's height. Omit for Auto: as tall as the content. Content stays at the top unless a cell's alignY says otherwise.`
  );

/** The height capability's data for the agent-facing per-tier lengths, null when they set nothing. */
export function minHeightData(input: z.infer<typeof minHeightShape>): HeightData | null {
  if (!input) return null;
  const data = normalizeHeightData({ desktop: { min: input.desktop }, tablet: { min: input.tablet }, phone: { min: input.phone } });
  return Object.keys(data).length ? data : null;
}

// Narrowed to what the editor offers: no reversed directions, wrap-reverse or display.
const flexLayoutValueShape = z.object({
  flexDirection: z.enum(['row', 'column']).optional(),
  flexWrap: z.enum(['nowrap', 'wrap', 'scroll']).optional(),
  justifyContent: z.enum(['flex-start', 'center', 'flex-end', 'space-between', 'space-around', 'space-evenly']).optional(),
  alignItems: z.enum(['stretch', 'flex-start', 'center', 'flex-end', 'baseline']).optional(),
  gap: z.number().int().min(GAP_MIN).max(GAP_MAX).optional(),
});
export const flexLayoutShape = z
  .object({ desktop: flexLayoutValueShape.optional(), tablet: flexLayoutValueShape.optional(), phone: flexLayoutValueShape.optional() })
  .optional()
  .describe(
    "The row's arrangement per tier (tablet and phone inherit the larger tier, field by field): flexDirection 'row' (default) or 'column' (the cells stack); flexWrap 'nowrap' (default — one line, the cells get narrower), 'wrap' (breaks into lines) or 'scroll' (one line that scrolls sideways in its own box, e.g. a logo strip on a phone); justifyContent along the row ('flex-start' default, 'center', 'flex-end', 'space-between', 'space-around', 'space-evenly'); alignItems across it ('stretch' default, 'flex-start', 'center', 'flex-end', 'baseline'); gap between the cells in px. A row left alone stays a row on a phone."
  );

const flexBasis = z
  .string()
  .refine((v) => parseFlexBasis(v) != null, { message: `a length within ${FLEX_BASIS_UNITS.map((u) => `${FLEX_BASIS_BOUNDS[u].min}–${FLEX_BASIS_BOUNDS[u].max}${u}`).join(' / ')}` });
const flexItemValueShape = z.object({
  size: z.enum(['fill', 'fixed']).optional(),
  weight: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  basis: flexBasis.optional(),
  self: z.enum(['start', 'center', 'end', 'stretch']).optional(),
});
export const flexItemShape = z
  .object({ desktop: flexItemValueShape.optional(), tablet: flexItemValueShape.optional(), phone: flexItemValueShape.optional() })
  .optional()
  .describe(
    `The cell's size and alignment in its row, per tier (tablet and phone inherit the larger tier). Omit for Auto: as wide as its content, never wider than the row. size 'fill' shares the row's free space with the other filling cells by weight (1–3, default 1); size 'fixed' gives it basis as its own width (${FLEX_BASIS_UNITS.map((u) => `${FLEX_BASIS_BOUNDS[u].min}–${FLEX_BASIS_BOUNDS[u].max}${u}`).join(' / ')}, e.g. '140px' or '25%') — it needs one, else it stays Auto. self aligns it across the row ('start', 'center', 'end', 'stretch'); omitted, it follows the row's alignItems.`
  );

// The desktop's columns are the grid's columnWidths and gap; these are the
// tablet and phone overrides (blocks/grid/gridColumns.ts).
const tierRatios = z.union([z.array(z.number().int().min(1).max(12)).min(1).max(6), z.literal('auto')]).optional();
export const columnsByTierShape = z
  .object({ tablet: tierRatios, phone: tierRatios })
  .optional()
  .describe(
    "The grid's columns on a tablet and a phone, as whole-number proportions (1–12), e.g. { phone: [1, 1] } for two columns on a phone. A tablet never has more columns than the desktop (columnWidths), a phone never more than the tablet; where a tier has fewer, the cells flow into its columns in reading order (row-major), and merged cells and rowHeights apply only at the desktop's column count. Omitted (or 'auto'): a tablet keeps the desktop's columns, a phone stacks the cells in one column. Use it for compositions that should stay side by side on a phone — an icon beside its text ({ phone: [1, 6] } on a [1, 6] grid), four figures as 2 × 2 ({ phone: [1, 1] } on a four-column grid)."
  );
const tierGap = z.enum(['none', 'sm', 'md', 'lg', 'auto']).optional();
export const gapByTierShape = z
  .object({ tablet: tierGap, phone: tierGap })
  .optional()
  .describe("The gap between the grid's cells on a tablet and a phone ('none' | 'sm' | 'md' | 'lg'); omitted or 'auto' takes the larger tier's.");

const placementValueShape = z.object({
  align: z.enum(['start', 'center', 'end', 'stretch']).optional(),
});
export const placementShape = z
  .object({
    desktop: placementValueShape.optional(),
    tablet: placementValueShape.optional(),
    phone: placementValueShape.optional(),
  })
  .optional()
  .describe("Where the block sits in its column, grouped by tier (tablet and phone inherit the larger tier): 'start', 'center' or 'end' make it as wide as its content and put it there — e.g. a card at the end of its column, a centred button row — and 'stretch' gives it the column's full width. Omit for Auto: the column's width (a quick link: where its cell's alignment puts it).");

// Validated server-side by sizeOrNull.
const sizeShape = z
  .union([z.enum(TYPE_SCALE_REFS), z.number().min(SIZE_MIN).max(SIZE_MAX)])
  .describe(
    `A font size. Prefer a type-scale step 'scale:<step>' (${TYPE_SCALE_STEPS.join(', ')}, smallest to largest; body text is m): it follows the reader's font-size setting, and 3xl and up shrink on a narrow screen. A px number ${SIZE_MIN}–${SIZE_MAX} is a deliberate fixed size that does neither.`
  );

// family is a curated font-stack id (typography/fonts.ts), never a raw font-family.
const typographyValueShape = z.object({
  family: z.enum(['sans', 'serif', 'mono']).optional(),
  size: sizeShape.optional(),
  color: colorShape.optional(),
  weight: z.enum(['normal', 'medium', 'semibold', 'bold']).optional(),
});
export const typographyShape = z
  .object({
    desktop: typographyValueShape.optional(),
    tablet: typographyValueShape.optional(),
    phone: typographyValueShape.optional(),
  })
  .optional();
