// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The flex row's structural edits, called by the block tools.
import { Fragment } from '@tiptap/pm/model';
import { TextSelection } from '@tiptap/pm/state';
import { makePlaceholder } from '../placeholder/placeholderOps';

type N = any;

function cellNodesOf(cn: N): N[] {
  const cells: N[] = [];
  cn.forEach((c: N) => cells.push(c));
  return cells;
}

// Replacing the whole node loses the selection's mapping, so re-select inside it.
function rebuild(editor: N, pos: number, cn: N, cells: N[]): void {
  const filled = cells.filter(Boolean);
  if (filled.length === 0) return;
  const newNode = cn.type.create({ ...cn.attrs }, Fragment.fromArray(filled));
  let tr = editor.state.tr.replaceWith(pos, pos + cn.nodeSize, newNode);
  const insidePos = tr.doc.resolve(Math.min(pos + 1, tr.doc.content.size));
  tr = tr.setSelection(TextSelection.near(insidePos, 1)).setMeta('keepSelected', pos);
  editor.view.dispatch(tr);
  editor.view.focus();
}

export function canRemoveLastCell(cn: N): boolean {
  return cellNodesOf(cn).length > 1;
}

export function addCell(editor: N, pos: number): void {
  const cn = editor.state.doc.nodeAt(pos);
  if (!cn) return;
  // Not createAndFill(), which fills with whichever block node registered first.
  const empty = editor.state.schema.nodes.flexCell.create(null, editor.state.schema.nodes.placeholder.create());
  rebuild(editor, pos, cn, [...cellNodesOf(cn), empty]);
}

export function removeCell(editor: N, pos: number): void {
  const cn = editor.state.doc.nodeAt(pos);
  if (!cn) return;
  if (!canRemoveLastCell(cn)) return;
  rebuild(editor, pos, cn, cellNodesOf(cn).slice(0, -1));
}

// No layout data: an unset Layout capability is already the row it should be.
export function makeFlexContainer() {
  return {
    type: 'flexContainer',
    attrs: {},
    content: [
      { type: 'flexCell', content: [makePlaceholder()] },
      { type: 'flexCell', content: [makePlaceholder()] },
    ],
  };
}
