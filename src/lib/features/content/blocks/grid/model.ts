// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// A grid (grid > gridCell+). `columnWidths` is the column
// structure: its length the count, each value a weight (→ `Nfr`). Rows are
// implicit in position; the operations keep the grid full (cells = columns ×
// rows) and `rowHeights` as long as the rows. Grids nest inside cells.
import type { SpacingData } from '../../capabilities/spacing/spacing';
import type { SurfaceData } from '../../capabilities/surface/surface';
import type { HeightData } from '../../capabilities/height/height';
import type { TypographyData } from '../../capabilities/typography/typography';
import type { PlacementData } from '../../capabilities/placement/placement';
import type { GridColumnsByTier, GridGapByTier } from './gridColumns';

export interface GridAttrs {
  blockId?: string | null;
  columnWidths?: unknown;
  rowHeights?: unknown;
  gap?: string;
  /** Absent: the desktop's on a tablet, stacked on a phone (gridColumns.ts). */
  columnsByTier?: GridColumnsByTier | null;
  gapByTier?: GridGapByTier | null;
  spacing?: SpacingData | null;
  surface?: SurfaceData | null;
  height?: HeightData | null;
  width?: string;
  bleedToTop?: boolean;
  placement?: PlacementData | null;
}
export interface GridCellAttrs {
  typography?: TypographyData | null;
  spacing?: SpacingData | null;
  surface?: SurfaceData | null;
  colStart?: number | null;
  colSpan?: number | null;
  rowStart?: number | null;
  rowSpan?: number | null;
  stretch?: boolean;
  alignX?: string;
  alignY?: string;
}

/** Anything with a grid's attrs: a ProseMirror node or a stored JSON node. */
export type GridNodeLike = { attrs?: { readonly [key: string]: unknown } | null } | null | undefined;

const DEFAULT_WIDTHS = [1, 1];

export function widthsOf(node: GridNodeLike): number[] {
  const cw = node?.attrs?.columnWidths;
  if (Array.isArray(cw) && cw.length > 0) return cw.map((n: unknown) => Math.max(1, Math.round(Number(n) || 1)));
  return [...DEFAULT_WIDTHS];
}

// Null per row is auto. Unlike columnWidths, absent has no default: the first
// row-divider drag creates the array.
export function heightsOf(node: GridNodeLike): (number | null)[] | null {
  const rh = node?.attrs?.rowHeights;
  return Array.isArray(rh) ? rh.map((n: unknown) => (Number.isFinite(Number(n)) && Number(n) > 0 ? Math.round(Number(n)) : null)) : null;
}
