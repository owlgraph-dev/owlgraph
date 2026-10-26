// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The flex row's agent input (joined into blockInputSchema.server.ts) and its
// mapping to a node. Sparse: a field left out stays out, so Auto decides. An
// empty cell is stored empty, as the editor stores one (placeholderDoc.ts).
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  containerSurfaceShape,
  flexItemShape,
  flexLayoutShape,
  minHeightData,
  minHeightShape,
  placementShape,
  spacingShape,
  typographyShape,
} from '../../capabilities/inputShapes.server';
import type { JsonNode } from '../../doc/doc';

/** One cell's styling, aligned to the row's cells. */
const flexCellStyleShape = z.object({
  flexItem: flexItemShape,
  typography: typographyShape,
  spacing: spacingShape,
  surface: containerSurfaceShape,
});

const rowFields = {
  layout: flexLayoutShape,
  spacing: spacingShape,
  surface: containerSurfaceShape,
  minHeight: minHeightShape,
  width: z
    .enum(['normal', 'wide', 'full'])
    .optional()
    .describe("The row's band: 'normal' (the reading column, default), 'wide', or 'full' (the canvas edge to edge, its content inset by the page's side margin)."),
  placement: placementShape,
  bleedToTop: z.boolean().optional().describe("As the page's first block, sit flush against the page's top (a hero)."),
  cellStyles: z.array(flexCellStyleShape).optional().describe('Per-cell styling, aligned to cells (index i styles cell i).'),
};

/**
 * `leafBlock` is passed in: blockInputSchema.server.ts declares it and imports
 * this module, so this one can't import it back.
 */
export function flexInputShape<L extends z.ZodTypeAny>(leafBlock: L) {
  return z.object({
    kind: z.literal('flex'),
    ...rowFields,
    cells: z.array(z.array(leafBlock)).min(1).describe('The cells in order, each an array of blocks (any kind but a layout, a flex row or a section); a cell may be empty ([]).'),
  });
}

export type FlexRowInput = z.infer<z.ZodObject<typeof rowFields>>;
export type FlexCellStyleInput = z.infer<typeof flexCellStyleShape>;

function cellAttrs(style: FlexCellStyleInput | undefined): Record<string, unknown> {
  const a: Record<string, unknown> = {};
  for (const key of ['flexItem', 'typography', 'spacing', 'surface'] as const) {
    if (style?.[key]) a[key] = style[key];
  }
  return a;
}

/** `cells` are already built (blockInput.server.ts). */
export function flexNode(input: FlexRowInput, cells: JsonNode[][]): JsonNode {
  const attrs: Record<string, unknown> = { blockId: randomUUID() };
  for (const key of ['layout', 'spacing', 'surface', 'placement'] as const) {
    if (input[key]) attrs[key] = input[key];
  }
  const height = minHeightData(input.minHeight);
  if (height) attrs.height = height;
  if (input.width && input.width !== 'normal') attrs.width = input.width;
  if (input.bleedToTop) attrs.bleedToTop = true;
  const styles = input.cellStyles ?? [];
  return { type: 'flexContainer', attrs, content: cells.map((blocks, i) => ({ type: 'flexCell', attrs: cellAttrs(styles[i]), content: blocks })) };
}
