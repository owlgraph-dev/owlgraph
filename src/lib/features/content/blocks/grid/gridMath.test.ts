// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, it } from 'vitest';
import { boundaryCellIndices, boxesOf, isExplicit, planMerge, rowsOf, selectionBoxOf, type CellBox } from './gridMath';

const at = (colStart: number, rowStart: number, colSpan = 1, rowSpan = 1) => ({ colStart, rowStart, colSpan, rowSpan });
const box = (colStart: number, rowStart: number, colSpan = 1, rowSpan = 1): CellBox => ({ colStart, rowStart, colSpan, rowSpan });

describe('the merged-cell geometry of a grid', () => {
  it('flows implicit cells row by row, one per track', () => {
    const cells = [{}, {}, {}, {}, {}];
    expect(isExplicit(cells)).toBe(false);
    expect(boxesOf(cells, 2)).toEqual([box(1, 1), box(2, 1), box(1, 2), box(2, 2), box(1, 3)]);
    expect(rowsOf(boxesOf(cells, 2))).toBe(3);
  });

  it('reads explicit cells from their lines and spans', () => {
    // A cell across two columns and two rows beside a column of two.
    const cells = [at(1, 1, 2, 2), at(3, 1), at(3, 2)];
    expect(isExplicit(cells)).toBe(true);
    expect(boxesOf(cells, 3)).toEqual([box(1, 1, 2, 2), box(3, 1), box(3, 2)]);
    expect(rowsOf(boxesOf(cells, 3))).toBe(2);
  });

  it('finds the two cells that meet at a column boundary, and none where a merge spans it in every row', () => {
    const boxes = boxesOf([at(1, 1, 2, 2), at(3, 1), at(3, 2)], 3);
    expect(boundaryCellIndices(boxes, 0)).toBeNull();
    // The last cell whose right edge is the boundary, and the last that starts after it.
    expect(boundaryCellIndices(boxes, 1)).toEqual({ leftIdx: 0, rightIdx: 2 });
    // A seam in one row is enough.
    const partly = boxesOf([at(1, 1, 2, 1), at(3, 1), at(1, 2), at(2, 2), at(3, 2)], 3);
    expect(boundaryCellIndices(partly, 0)).toEqual({ leftIdx: 2, rightIdx: 3 });
  });

  it('plans a merge of the cells a rectangle covers whole, its top-left one surviving', () => {
    const cells = [{}, {}, {}, {}, {}, {}];
    expect(planMerge(cells, 3, box(1, 1, 2, 1))).toEqual({ survivorIndex: 0, absorbedIndices: [1] });
    expect(planMerge(cells, 3, box(2, 1, 2, 2))).toEqual({ survivorIndex: 1, absorbedIndices: [2, 4, 5] });
  });

  it('refuses a rectangle that cuts a merged cell, and one that covers a single cell', () => {
    const merged = [at(1, 1, 2, 1), at(3, 1), at(1, 2), at(2, 2), at(3, 2)];
    expect(planMerge(merged, 3, box(2, 1, 2, 2))).toBeNull();
    expect(planMerge(merged, 3, box(3, 1))).toBeNull();
    // Taking the merged cell in whole is a merge again.
    expect(planMerge(merged, 3, box(1, 1, 3, 1))).toEqual({ survivorIndex: 0, absorbedIndices: [1] });
  });

  it('spans the rectangle of a selection from its first and last cell', () => {
    const boxes = boxesOf([at(1, 1, 2, 1), at(3, 1), at(1, 2), at(2, 2), at(3, 2)], 3);
    expect(selectionBoxOf(1, 3, boxes)).toEqual(box(2, 1, 2, 2));
    expect(selectionBoxOf(0, 0, boxes)).toEqual(box(1, 1, 2, 1));
  });
});
