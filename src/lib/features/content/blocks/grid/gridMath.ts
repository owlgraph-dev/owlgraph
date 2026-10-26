// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// A grid's merged-cell geometry. A grid is implicit (cells flow
// row-major) until its first merge stamps every cell with explicit
// colStart/rowStart; the modes never mix. An explicit grid keeps its cells
// sorted by (rowStart, colStart), and their boxes tile rows × cols exactly.

type CellAttrsLike = { readonly [key: string]: unknown } | null | undefined;

export type CellBox = { colStart: number; rowStart: number; colSpan: number; rowSpan: number };

export function isExplicit(cellsAttrs: readonly CellAttrsLike[]): boolean {
  return cellsAttrs.some((a) => a?.colStart != null);
}

export function boxesOf(cellsAttrs: readonly CellAttrsLike[], cols: number): CellBox[] {
  const explicit = isExplicit(cellsAttrs);
  return cellsAttrs.map((a, i) =>
    explicit
      ? {
          colStart: Number(a?.colStart) || 1,
          rowStart: Number(a?.rowStart) || 1,
          colSpan: Math.max(1, Number(a?.colSpan) || 1),
          rowSpan: Math.max(1, Number(a?.rowSpan) || 1),
        }
      : { colStart: (i % cols) + 1, rowStart: Math.floor(i / cols) + 1, colSpan: 1, rowSpan: 1 }
  );
}

export function rowsOf(boxes: CellBox[]): number {
  return boxes.reduce((m, b) => Math.max(m, b.rowStart + b.rowSpan - 1), 0) || 1;
}

// Two cells that meet at column boundary k (0-based, between grid columns k+1
// and k+2), as indices into `boxes`; null where a merge spans the boundary in
// every row, so there's nothing to divide.
export function boundaryCellIndices(boxes: CellBox[], k: number): { leftIdx: number; rightIdx: number } | null {
  let leftIdx = -1, rightIdx = -1;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (b.colStart + b.colSpan - 1 === k + 1) leftIdx = i;
    if (b.colStart === k + 2) rightIdx = i;
  }
  return leftIdx >= 0 && rightIdx >= 0 ? { leftIdx, rightIdx } : null;
}

function boxesOverlap(a: CellBox, b: CellBox): boolean {
  return (
    a.colStart <= b.colStart + b.colSpan - 1 &&
    a.colStart + a.colSpan - 1 >= b.colStart &&
    a.rowStart <= b.rowStart + b.rowSpan - 1 &&
    a.rowStart + a.rowSpan - 1 >= b.rowStart
  );
}

function boxContains(outer: CellBox, inner: CellBox): boolean {
  return (
    inner.colStart >= outer.colStart &&
    inner.colStart + inner.colSpan - 1 <= outer.colStart + outer.colSpan - 1 &&
    inner.rowStart >= outer.rowStart &&
    inner.rowStart + inner.rowSpan - 1 <= outer.rowStart + outer.rowSpan - 1
  );
}

// Null when the rectangle isn't a legal merge: it cuts a cell, or covers
// fewer than two.
export function planMerge(cellsAttrs: readonly CellAttrsLike[], cols: number, selection: CellBox): { survivorIndex: number; absorbedIndices: number[] } | null {
  const boxes = boxesOf(cellsAttrs, cols);
  const covered: number[] = [];
  let survivorIndex = -1;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (!boxesOverlap(b, selection)) continue;
    if (!boxContains(selection, b)) return null;
    covered.push(i);
    if (b.colStart === selection.colStart && b.rowStart === selection.rowStart) survivorIndex = i;
  }
  if (survivorIndex === -1 || covered.length < 2) return null;
  return { survivorIndex, absorbedIndices: covered.filter((i) => i !== survivorIndex) };
}

/** The rectangle a merge selection spans from its first to its last cell. */
export function selectionBoxOf(aIdx: number, bIdx: number, boxes: CellBox[]): CellBox {
  const a = boxes[aIdx];
  const b = boxes[bIdx];
  const colStart = Math.min(a.colStart, b.colStart);
  const rowStart = Math.min(a.rowStart, b.rowStart);
  const colEnd = Math.max(a.colStart + a.colSpan - 1, b.colStart + b.colSpan - 1);
  const rowEnd = Math.max(a.rowStart + a.rowSpan - 1, b.rowStart + b.rowSpan - 1);
  return { colStart, rowStart, colSpan: colEnd - colStart + 1, rowSpan: rowEnd - rowStart + 1 };
}
