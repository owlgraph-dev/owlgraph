// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The grid's structural edits, called by the block tools and the grid's
// NodeView.
import { Fragment } from '@tiptap/pm/model';
import { TextSelection } from '@tiptap/pm/state';
import type { SpaceToken } from './gridStyle';
import { withAddedTrack } from '../shared/gridResize';
import { makePlaceholder, normalizeCellContent } from '../placeholder/placeholderOps';
import { gridTierAttrs, withGridTierGap, type GapStep, type GridTier } from './gridColumns';
import { heightsOf, widthsOf } from './model';
import { boxesOf, isExplicit, planMerge, rowsOf, type CellBox } from './gridMath';

type N = any;

// Not createAndFill(), which fills with whichever block node registered first.
function emptyCellFor(editor: N): N {
  return editor.state.schema.nodes.gridCell.create(null, editor.state.schema.nodes.placeholder.create());
}

export function cellNodesOf(cn: N): N[] {
  const cells: N[] = [];
  cn.forEach((c: N) => cells.push(c));
  return cells;
}

function withAttrs(c: N, attrs: Record<string, unknown>): N {
  return c.type.create({ ...c.attrs, ...attrs }, c.content);
}

// Restores row-major order after cells were appended out of order.
function sortRowMajor(cells: N[]): N[] {
  return [...cells].sort((a, b) => (a.attrs.rowStart - b.attrs.rowStart) || (a.attrs.colStart - b.attrs.colStart));
}

// Implicit grids only: an explicit (merged) grid tiles fully, never short a cell.
function gridOf(cn: N, editor: N): { cols: number; rows: number; cells: N[] } {
  const cols = widthsOf(cn).length;
  const cells: N[] = [];
  cn.forEach((c: N) => cells.push(c));
  const rows = Math.max(1, Math.ceil(cells.length / cols));
  while (cells.length < rows * cols) cells.push(emptyCellFor(editor));
  return { cols, rows, cells };
}

function heightsAfterAddRow(cn: N): (number | null)[] | null {
  const h = heightsOf(cn);
  return h ? [...h, null] : null;
}
function heightsAfterRemoveRow(cn: N): (number | null)[] | null {
  const h = heightsOf(cn);
  return h ? h.slice(0, -1) : null;
}

// rowHeights is omitted (kept) unless the row count changes. Replacing the
// whole node loses the selection's mapping, so re-select just inside `pos`
// (stable, nothing before it shifts) and tag 'keepSelected' so the editor
// keeps this container selected.
function rebuild(editor: N, pos: number, cn: N, cells: N[], widths: number[], rowHeights?: (number | null)[] | null): void {
  const filled = cells.filter(Boolean);
  if (filled.length === 0) return;
  const rh = rowHeights !== undefined ? rowHeights : cn.attrs.rowHeights;
  // A removed desktop column cuts the smaller tiers too (gridColumns.ts).
  const tiers = gridTierAttrs({ ...cn.attrs, columnWidths: widths });
  const newNode = cn.type.create({ ...cn.attrs, columnWidths: widths, rowHeights: rh, ...tiers }, Fragment.fromArray(filled));
  let tr = editor.state.tr.replaceWith(pos, pos + cn.nodeSize, newNode);
  const insidePos = tr.doc.resolve(Math.min(pos + 1, tr.doc.content.size));
  tr = tr.setSelection(TextSelection.near(insidePos, 1)).setMeta('keepSelected', pos);
  editor.view.dispatch(tr);
  editor.view.focus();
}

// Gives every unplaced cell the place auto-flow gives it now (boxesOf).
function stampExplicit(cells: N[], cols: number): N[] {
  const boxes = boxesOf(cells.map((c) => c.attrs), cols);
  return cells.map((c, i) =>
    c.attrs.colStart != null ? c : withAttrs(c, { colStart: boxes[i].colStart, rowStart: boxes[i].rowStart, colSpan: 1, rowSpan: 1 })
  );
}

export function canRemoveLastContainerColumn(cn: N): boolean {
  const cols = widthsOf(cn).length;
  if (cols <= 1) return false;
  const attrs = cellNodesOf(cn).map((c) => c.attrs);
  if (!isExplicit(attrs)) return true;
  return !boxesOf(attrs, cols).some((b) => b.colSpan > 1 && b.colStart + b.colSpan - 1 === cols);
}

export function canRemoveLastContainerRow(cn: N): boolean {
  const cols = widthsOf(cn).length;
  const attrs = cellNodesOf(cn).map((c) => c.attrs);
  const explicit = isExplicit(attrs);
  const boxes = boxesOf(attrs, cols);
  const rows = explicit ? rowsOf(boxes) : Math.max(1, Math.ceil(cellNodesOf(cn).length / cols));
  if (rows <= 1) return false;
  if (!explicit) return true;
  return !boxes.some((b) => b.rowSpan > 1 && b.rowStart + b.rowSpan - 1 === rows);
}

export function addContainerColumn(editor: N, pos: number): void {
  const cn = editor.state.doc.nodeAt(pos);
  if (!cn) return;
  const cells = cellNodesOf(cn);
  const cols = widthsOf(cn).length;
  const attrs = cells.map((c: N) => c.attrs);
  if (isExplicit(attrs)) {
    const rows = rowsOf(boxesOf(attrs, cols));
    const out = [...cells];
    for (let r = 1; r <= rows; r++) out.push(withAttrs(emptyCellFor(editor), { colStart: cols + 1, rowStart: r, colSpan: 1, rowSpan: 1 }));
    rebuild(editor, pos, cn, sortRowMajor(out), withAddedTrack(widthsOf(cn)));
    return;
  }
  const { rows } = gridOf(cn, editor);
  const out: N[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) out.push(cells[r * cols + c]);
    out.push(emptyCellFor(editor));
  }
  // The new column takes an even share, however the weights are scaled.
  rebuild(editor, pos, cn, out, withAddedTrack(widthsOf(cn)));
}

export function removeContainerColumn(editor: N, pos: number): void {
  const cn = editor.state.doc.nodeAt(pos);
  if (!cn) return;
  if (!canRemoveLastContainerColumn(cn)) return;
  const cells = cellNodesOf(cn);
  const cols = widthsOf(cn).length;
  const attrs = cells.map((c: N) => c.attrs);
  if (isExplicit(attrs)) {
    const boxes = boxesOf(attrs, cols);
    const out = cells.filter((_: N, i: number) => boxes[i].colStart + boxes[i].colSpan - 1 < cols);
    rebuild(editor, pos, cn, out, widthsOf(cn).slice(0, cols - 1));
    return;
  }
  const { rows } = gridOf(cn, editor);
  const out: N[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols - 1; c++) out.push(cells[r * cols + c]);
  rebuild(editor, pos, cn, out, widthsOf(cn).slice(0, cols - 1));
}

export function addContainerRow(editor: N, pos: number): void {
  const cn = editor.state.doc.nodeAt(pos);
  if (!cn) return;
  const cells = cellNodesOf(cn);
  const cols = widthsOf(cn).length;
  const attrs = cells.map((c: N) => c.attrs);
  if (isExplicit(attrs)) {
    const rows = rowsOf(boxesOf(attrs, cols));
    const out = [...cells];
    for (let c = 1; c <= cols; c++) out.push(withAttrs(emptyCellFor(editor), { colStart: c, rowStart: rows + 1, colSpan: 1, rowSpan: 1 }));
    rebuild(editor, pos, cn, sortRowMajor(out), widthsOf(cn), heightsAfterAddRow(cn));
    return;
  }
  const { cells: padded } = gridOf(cn, editor);
  const out = [...padded];
  for (let c = 0; c < cols; c++) out.push(emptyCellFor(editor));
  rebuild(editor, pos, cn, out, widthsOf(cn), heightsAfterAddRow(cn));
}

export function removeContainerRow(editor: N, pos: number): void {
  const cn = editor.state.doc.nodeAt(pos);
  if (!cn) return;
  if (!canRemoveLastContainerRow(cn)) return;
  const cells = cellNodesOf(cn);
  const cols = widthsOf(cn).length;
  const attrs = cells.map((c: N) => c.attrs);
  if (isExplicit(attrs)) {
    const boxes = boxesOf(attrs, cols);
    const rows = rowsOf(boxes);
    const out = cells.filter((_: N, i: number) => boxes[i].rowStart + boxes[i].rowSpan - 1 < rows);
    rebuild(editor, pos, cn, out, widthsOf(cn), heightsAfterRemoveRow(cn));
    return;
  }
  const { rows, cells: padded } = gridOf(cn, editor);
  rebuild(editor, pos, cn, padded.slice(0, (rows - 1) * cols), widthsOf(cn), heightsAfterRemoveRow(cn));
}

/**
 * The desktop's gap is `gap` (the smaller tiers re-validated against it), a
 * smaller tier's its `gapByTier` entry; null clears that to the tier above's.
 */
export function setGap(editor: N, pos: number, gap: SpaceToken | null, bp: 'desktop' | GridTier = 'desktop'): void {
  const cn = editor.state.doc.nodeAt(pos);
  if (!cn) return;
  const attrs = bp === 'desktop'
    ? { ...cn.attrs, gap: gap ?? null, gapByTier: gridTierAttrs({ ...cn.attrs, gap: gap ?? null }).gapByTier }
    : { ...cn.attrs, gapByTier: withGridTierGap(cn.attrs, bp, gap as GapStep | null) };
  editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, attrs));
}

/**
 * Merges the cells a rectangle covers into its top-left one, their content in
 * order; the grid becomes explicit if it wasn't. A rectangle planMerge
 * refuses changes nothing.
 */
export function mergeCells(editor: N, pos: number, selection: CellBox): void {
  const cn = editor.state.doc.nodeAt(pos);
  if (!cn) return;
  const cols = widthsOf(cn).length;
  const cells = cellNodesOf(cn);
  const plan = planMerge(cells.map((c) => c.attrs), cols, selection);
  if (!plan) return;
  const stamped = stampExplicit(cells, cols);
  const survivor = stamped[plan.survivorIndex];
  const rawMerged = plan.absorbedIndices.reduce((frag, idx) => frag.append(stamped[idx].content), survivor.content as Fragment);
  // One placeholder if nothing real survived, none if something did.
  const mergedContent = normalizeCellContent(rawMerged, editor.state.schema);
  const merged = withAttrs(survivor, {
    colStart: selection.colStart,
    rowStart: selection.rowStart,
    colSpan: selection.colSpan,
    rowSpan: selection.rowSpan,
  });
  const withContent = merged.type.create(merged.attrs, mergedContent);
  const out = stamped
    .map((c, i) => (i === plan.survivorIndex ? withContent : c))
    .filter((_, i) => !plan.absorbedIndices.includes(i));
  rebuild(editor, pos, cn, out, widthsOf(cn));
}

/**
 * Restores the empty 1×1 cells a merge absorbed; the surviving cell keeps
 * its (now lossy) concatenated content and shrinks back to 1×1 in place.
 */
export function unmergeCell(editor: N, pos: number, cellIndex: number): void {
  const cn = editor.state.doc.nodeAt(pos);
  if (!cn) return;
  const cells = cellNodesOf(cn);
  const target = cells[cellIndex];
  const { colStart, rowStart, colSpan, rowSpan } = target.attrs;
  if (!(colSpan > 1 || rowSpan > 1)) return;
  const out = [...cells];
  out[cellIndex] = withAttrs(target, { colSpan: 1, rowSpan: 1 });
  for (let r = 0; r < rowSpan; r++) {
    for (let c = 0; c < colSpan; c++) {
      if (r === 0 && c === 0) continue;
      out.push(withAttrs(emptyCellFor(editor), { colStart: colStart + c, rowStart: rowStart + r, colSpan: 1, rowSpan: 1 }));
    }
  }
  rebuild(editor, pos, cn, sortRowMajor(out), widthsOf(cn));
}

export function makeContainer() {
  return {
    type: 'grid',
    attrs: { columnWidths: [1, 1] },
    content: [
      { type: 'gridCell', content: [makePlaceholder()] },
      { type: 'gridCell', content: [makePlaceholder()] },
    ],
  };
}

// The single-cell grid a query block repeats per result; not offered on its own.
export function makeQueryTemplate() {
  return {
    type: 'grid',
    attrs: { columnWidths: [1] },
    content: [{ type: 'gridCell', content: [makePlaceholder()] }],
  };
}
