// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The table's structural edits and its cell-to-cell keyboard moves.
import { Fragment } from '@tiptap/pm/model';
import { TextSelection } from '@tiptap/pm/state';
import { columnWeights } from './model';
import { withAddedTrack } from '../shared/gridResize';

type N = any;

function widthsOf(table: N): number[] {
  return columnWeights(table?.attrs?.columnWidths, table?.childCount ? table.child(0).childCount : 1);
}

function rowsOf(table: N): N[] {
  const rows: N[] = [];
  table.forEach((r: N) => rows.push(r));
  return rows;
}

function emptyCellFor(editor: N, isHeader: boolean): N {
  return editor.state.schema.nodes.tableCell.create({ isHeader });
}
function emptyRowFor(editor: N, isHeader: boolean, cols: number): N {
  return editor.state.schema.nodes.tableRow.create(
    { isHeader },
    Fragment.fromArray(Array.from({ length: cols }, () => emptyCellFor(editor, isHeader)))
  );
}

// Replacing the whole node loses the selection's mapping, so re-select just
// inside `pos` and tag 'keepSelected' so the editor keeps the table selected.
function rebuild(editor: N, pos: number, tn: N, rows: N[], columnWidths: number[]): void {
  const newNode = tn.type.create({ ...tn.attrs, columnWidths }, Fragment.fromArray(rows));
  let tr = editor.state.tr.replaceWith(pos, pos + tn.nodeSize, newNode);
  const insidePos = tr.doc.resolve(Math.min(pos + 1, tr.doc.content.size));
  tr = tr.setSelection(TextSelection.near(insidePos, 1)).setMeta('keepSelected', pos);
  editor.view.dispatch(tr);
  editor.view.focus();
}

export function canRemoveLastTableColumn(tn: N): boolean {
  return tn.child(0).childCount > 1;
}
export function canRemoveLastTableRow(tn: N): boolean {
  return rowsOf(tn).length > 1;
}

export function addTableColumn(editor: N, pos: number): void {
  const tn = editor.state.doc.nodeAt(pos);
  if (!tn) return;
  const rows = rowsOf(tn).map((r: N) => {
    const cells: N[] = [];
    r.forEach((c: N) => cells.push(c));
    cells.push(emptyCellFor(editor, !!r.attrs.isHeader));
    return r.type.create(r.attrs, Fragment.fromArray(cells));
  });
  // The new column takes an even share, however the weights are scaled.
  rebuild(editor, pos, tn, rows, withAddedTrack(widthsOf(tn)));
}

export function removeTableColumn(editor: N, pos: number): void {
  const tn = editor.state.doc.nodeAt(pos);
  if (!tn) return;
  if (!canRemoveLastTableColumn(tn)) return;
  const rows = rowsOf(tn).map((r: N) => {
    const cells: N[] = [];
    r.forEach((c: N) => cells.push(c));
    cells.pop();
    return r.type.create(r.attrs, Fragment.fromArray(cells));
  });
  rebuild(editor, pos, tn, rows, widthsOf(tn).slice(0, -1));
}

export function addTableRow(editor: N, pos: number): void {
  const tn = editor.state.doc.nodeAt(pos);
  if (!tn) return;
  const cols = tn.child(0).childCount;
  rebuild(editor, pos, tn, [...rowsOf(tn), emptyRowFor(editor, false, cols)], widthsOf(tn));
}

export function removeTableRow(editor: N, pos: number): void {
  const tn = editor.state.doc.nodeAt(pos);
  if (!tn) return;
  if (!canRemoveLastTableRow(tn)) return;
  const rows = rowsOf(tn);
  rebuild(editor, pos, tn, rows.slice(0, -1), widthsOf(tn));
}

export function toggleShowHeader(editor: N, pos: number): void {
  const tn = editor.state.doc.nodeAt(pos);
  if (!tn) return;
  editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...tn.attrs, showHeader: tn.attrs.showHeader === false }));
}

function cellNavInfo(editor: N): { $from: N; cellDepth: number; rowDepth: number; tableDepth: number } | null {
  const { $from } = editor.state.selection;
  let cellDepth = -1, rowDepth = -1, tableDepth = -1;
  for (let d = $from.depth; d >= 0; d--) {
    const t = $from.node(d).type.name;
    if (t === 'tableCell' && cellDepth < 0) cellDepth = d;
    if (t === 'tableRow' && rowDepth < 0) rowDepth = d;
    if (t === 'table' && tableDepth < 0) tableDepth = d;
  }
  if (cellDepth < 0 || rowDepth < 0 || tableDepth < 0) return null;
  return { $from, cellDepth, rowDepth, tableDepth };
}

function posBeforeChild(parentContentStart: number, parent: N, index: number): number {
  let pos = parentContentStart;
  for (let i = 0; i < index; i++) pos += parent.child(i).nodeSize;
  return pos;
}

function moveTo(editor: N, contentStartPos: number): boolean {
  const $pos = editor.state.doc.resolve(contentStartPos);
  const sel = TextSelection.near($pos, 1);
  editor.view.dispatch(editor.state.tr.setSelection(sel).scrollIntoView());
  return true;
}

export function atCellBoundary(editor: N, edge: 'start' | 'end'): boolean {
  const info = cellNavInfo(editor);
  if (!info) return false;
  const { $from, cellDepth } = info;
  const cell = $from.node(cellDepth);
  const offset = $from.parentOffset;
  return edge === 'start' ? offset === 0 : offset === cell.content.size;
}

export function moveCell(editor: N, dir: 1 | -1): boolean {
  const info = cellNavInfo(editor);
  if (!info) return false;
  const { $from, rowDepth, tableDepth } = info;
  const row = $from.node(rowDepth);
  const cellIndex = $from.index(rowDepth);
  const nextIndex = cellIndex + dir;
  if (nextIndex >= 0 && nextIndex < row.childCount) {
    return moveTo(editor, posBeforeChild($from.start(rowDepth), row, nextIndex) + 1);
  }
  const table = $from.node(tableDepth);
  const rowIndex = $from.index(tableDepth);
  const targetRowIndex = rowIndex + dir;
  if (targetRowIndex < 0 || targetRowIndex >= table.childCount) return false;
  const targetRow = table.child(targetRowIndex);
  const targetCellIndex = dir === 1 ? 0 : targetRow.childCount - 1;
  const rowContentStart = posBeforeChild($from.start(tableDepth), table, targetRowIndex) + 1;
  return moveTo(editor, posBeforeChild(rowContentStart, targetRow, targetCellIndex) + 1);
}

export function moveRow(editor: N, dir: 1 | -1): boolean {
  const info = cellNavInfo(editor);
  if (!info) return false;
  const { $from, rowDepth, tableDepth } = info;
  const table = $from.node(tableDepth);
  const rowIndex = $from.index(tableDepth);
  const cellIndex = $from.index(rowDepth);
  const targetRowIndex = rowIndex + dir;
  if (targetRowIndex < 0 || targetRowIndex >= table.childCount) return false;
  const targetRow = table.child(targetRowIndex);
  const targetCellIndex = Math.min(cellIndex, targetRow.childCount - 1);
  const rowContentStart = posBeforeChild($from.start(tableDepth), table, targetRowIndex) + 1;
  return moveTo(editor, posBeforeChild(rowContentStart, targetRow, targetCellIndex) + 1);
}
