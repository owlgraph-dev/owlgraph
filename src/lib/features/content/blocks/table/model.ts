// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// A table (table > tableRow+ > tableCell); a cell holds
// inline content, so marks work as in a paragraph. Row 0 is the header row:
// `isHeader` is stamped at creation and kept by construction, as that row is
// never moved or removed.
import type { SpacingData } from '../../capabilities/spacing/spacing';
import type { SurfaceData } from '../../capabilities/surface/surface';
import type { JsonNode } from '../../doc/doc';
import { flooredWeights } from '../shared/gridResize';

export interface TableAttrs {
  blockId?: string | null;
  columnWidths?: unknown;
  showHeader?: boolean;
  surface?: SurfaceData | null;
  /** The table's own space above it (blockSpacing.ts) — NOT its cells' padding. */
  spacing?: SpacingData | null;
}
export interface TableRowAttrs {
  isHeader?: boolean;
  height?: number | null;
}
export interface TableCellAttrs {
  isHeader?: boolean;
  spacing?: SpacingData | null;
  surface?: SurfaceData | null;
}

/**
 * The stored weights when they fit the column count, else equal ones, floored
 * at what a drag allows: a narrower stored column would vanish or stretch the
 * table's min width, which its narrowest column decides (tableStyle.ts).
 */
export function columnWeights(columnWidths: unknown, cols: number): number[] {
  const stored = Array.isArray(columnWidths) && columnWidths.length === cols ? columnWidths.map((n: unknown) => Math.max(1, Number(n) || 1)) : new Array(cols).fill(1);
  return flooredWeights(stored);
}

/** A header row and one empty body row. */
export function makeTable(cols = 2): JsonNode {
  const headerCells = Array.from({ length: cols }, (_, i) => ({
    type: 'tableCell',
    attrs: { isHeader: true },
    content: [{ type: 'text', text: `Column ${String.fromCharCode(65 + i)}` }],
  }));
  const bodyCells = Array.from({ length: cols }, () => ({ type: 'tableCell', attrs: { isHeader: false } }));
  return {
    type: 'table',
    attrs: { columnWidths: new Array(cols).fill(1) },
    content: [
      { type: 'tableRow', attrs: { isHeader: true }, content: headerCells },
      { type: 'tableRow', attrs: { isHeader: false }, content: bodyCells },
    ],
  };
}
