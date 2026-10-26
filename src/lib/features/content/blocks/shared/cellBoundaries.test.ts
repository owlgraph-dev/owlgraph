// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { getSchema, type JSONContent } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Document from '@tiptap/extension-document';
import type { Node as PMNode } from '@tiptap/pm/model';
import { AllSelection, EditorState, NodeSelection, TextSelection, type Selection } from '@tiptap/pm/state';
import { Paragraph } from '../paragraph/tiptap';
import { Grid, GridCell } from '../grid/tiptap';
import { FlexContainer, FlexCell } from '../flex/tiptap';
import { Table, TableRow, TableCell } from '../table/tiptap';
import { CellBoundaries, clampToCell, selectAllStep } from './cellBoundaries';

// Real node definitions, since their `isolating` spec decides what a cell is.
const extensions = [
  StarterKit.configure({ document: false, paragraph: false, codeBlock: false }),
  Paragraph,
  Document.extend({ content: '(block | grid | flexContainer)+' }),
  Grid.configure({ interactive: false }),
  GridCell,
  FlexContainer,
  FlexCell,
  Table.configure({ interactive: false }),
  TableRow,
  TableCell,
  CellBoundaries,
];
const schema = getSchema(extensions);
const plugins = CellBoundaries.config.addProseMirrorPlugins!.call({} as never);

const p = (t: string): JSONContent => ({ type: 'paragraph', content: [{ type: 'text', text: t }] });
const fcell = (...c: JSONContent[]): JSONContent => ({ type: 'flexCell', content: c });
const gcell = (...c: JSONContent[]): JSONContent => ({ type: 'gridCell', content: c });
const tcell = (t: string, isHeader = false): JSONContent => ({ type: 'tableCell', attrs: { isHeader }, content: [{ type: 'text', text: t }] });
const docOf = (...content: JSONContent[]) => schema.nodeFromJSON({ type: 'doc', content });

const flexDoc = docOf(
  p('intro'),
  { type: 'flexContainer', content: [fcell(p('a1'), p('a2')), fcell(p('b1')), fcell(p('c2text'), { type: 'flexContainer', content: [fcell(p('n1')), fcell(p('n2'))] })] },
  p('outro')
);
const gridDoc = docOf(p('intro'), { type: 'grid', attrs: { columnWidths: [1, 1, 1] }, content: [gcell(p('a1')), gcell(p('b1')), gcell(p('c1'))] }, p('outro'));
const tableDoc = docOf(
  p('intro'),
  { type: 'table', content: [{ type: 'tableRow', attrs: { isHeader: true }, content: [tcell('H1', true), tcell('H2', true)] }, { type: 'tableRow', content: [tcell('a1'), tcell('b1')] }] },
  p('outro')
);

/** The position of a text's start, or (with `end`) its end. */
function at(doc: PMNode, text: string, end = false): number {
  let found = -1;
  doc.descendants((node, pos) => {
    if (found < 0 && node.isText && node.text === text) found = pos + (end ? text.length : 0);
  });
  if (found < 0) throw new Error(`no text ${text}`);
  return found;
}
/** Where the head ends up, as "<text>:start|end|<offset>". */
function clampedHead(doc: PMNode, anchor: number, head: number): string | null {
  const clamped = clampToCell(doc, TextSelection.create(doc, anchor, head));
  if (!clamped) return null;
  let label = `@${clamped.head}`;
  doc.descendants((node, pos) => {
    if (node.isText && clamped.head >= pos && clamped.head <= pos + node.text!.length) {
      const off = clamped.head - pos;
      label = `${node.text}:${off === 0 ? 'start' : off === node.text!.length ? 'end' : off}`;
    }
  });
  return label;
}

describe('a text selection stays in the cell it started in', () => {
  it('leaves a selection inside one cell, and one that covers a container whole', () => {
    expect(clampedHead(flexDoc, at(flexDoc, 'a1'), at(flexDoc, 'a2', true))).toBeNull();
    expect(clampedHead(flexDoc, at(flexDoc, 'intro', true), at(flexDoc, 'outro'))).toBeNull();
    expect(clampedHead(flexDoc, at(flexDoc, 'outro'), at(flexDoc, 'intro', true))).toBeNull();
  });

  it("stops a head that left the anchor's cell at that cell's edge, either way", () => {
    expect(clampedHead(flexDoc, at(flexDoc, 'a1') + 1, at(flexDoc, 'b1') + 1)).toBe('a2:end');
    expect(clampedHead(flexDoc, at(flexDoc, 'b1') + 1, at(flexDoc, 'a1') + 1)).toBe('b1:start');
    expect(clampedHead(flexDoc, at(flexDoc, 'b1') + 1, at(flexDoc, 'outro') + 2)).toBe('b1:end');
    expect(clampedHead(gridDoc, at(gridDoc, 'a1') + 1, at(gridDoc, 'c1') + 1)).toBe('a1:end');
    expect(clampedHead(gridDoc, at(gridDoc, 'b1') + 1, at(gridDoc, 'outro') + 2)).toBe('b1:end');
  });

  it('stops a head that entered a container from outside before it, on the anchor\'s side', () => {
    expect(clampedHead(flexDoc, at(flexDoc, 'intro') + 2, at(flexDoc, 'b1') + 1)).toBe('intro:end');
    expect(clampedHead(flexDoc, at(flexDoc, 'outro') + 2, at(flexDoc, 'b1') + 1)).toBe('outro:start');
    // A row nested in the anchor's cell is entered from outside too.
    expect(clampedHead(flexDoc, at(flexDoc, 'c2text') + 1, at(flexDoc, 'n2') + 1)).toBe('c2text:end');
    expect(clampedHead(gridDoc, at(gridDoc, 'intro') + 2, at(gridDoc, 'b1') + 1)).toBe('intro:end');
  });

  it('keeps a head in a nested cell, and steps out of a container that ends the cell', () => {
    expect(clampedHead(flexDoc, at(flexDoc, 'n1') + 1, at(flexDoc, 'b1') + 1)).toBe('n1:start');
    // The cell's edge lies past the nested row, so the head leaves that row too.
    expect(clampedHead(flexDoc, at(flexDoc, 'c2text') + 1, at(flexDoc, 'outro') + 2)).toBe('c2text:end');
  });

  it("keeps a table selection in the anchor's cell", () => {
    expect(clampedHead(tableDoc, at(tableDoc, 'a1') + 1, at(tableDoc, 'b1') + 1)).toBe('a1:end');
    expect(clampedHead(tableDoc, at(tableDoc, 'H1') + 1, at(tableDoc, 'b1') + 1)).toBe('H1:end');
    expect(clampedHead(tableDoc, at(tableDoc, 'intro') + 2, at(tableDoc, 'a1') + 1)).toBe('intro:end');
  });

  it('leaves node selections and select-all alone', () => {
    const rowPos = at(flexDoc, 'intro', true) + 1;
    expect(clampToCell(flexDoc, NodeSelection.create(flexDoc, rowPos))).toBeNull();
    expect(clampToCell(flexDoc, new AllSelection(flexDoc))).toBeNull();
  });

  it('clamps as the selection is set, so typing over it changes one cell and keeps the row', () => {
    let state = EditorState.create({ schema, doc: flexDoc, plugins });
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, at(flexDoc, 'a1') + 1, at(flexDoc, 'b1') + 1)));
    expect(state.selection.head).toBe(at(flexDoc, 'a2', true));
    state = state.apply(state.tr.insertText('X'));
    const row = state.doc.child(1);
    expect(row.childCount).toBe(3);
    expect(row.child(0).textContent).toBe('aX');
    expect(row.child(1).textContent).toBe('b1');
  });
});

describe('select-all goes in two steps', () => {
  const step = (doc: PMNode, sel: (d: PMNode) => import('@tiptap/pm/state').Selection) => selectAllStep(EditorState.create({ schema, doc, selection: sel(doc) }));

  it('selects the text block first, then the page', () => {
    const first = step(flexDoc, (d) => TextSelection.create(d, at(d, 'b1') + 1));
    expect(first).toBeInstanceOf(TextSelection);
    expect([first.from, first.to]).toEqual([at(flexDoc, 'b1'), at(flexDoc, 'b1', true)]);
    const second = step(flexDoc, (d) => TextSelection.create(d, at(d, 'b1'), at(d, 'b1', true)));
    expect(second).toBeInstanceOf(AllSelection);
  });

  it("selects a table cell's text first", () => {
    const first = step(tableDoc, (d) => TextSelection.create(d, at(d, 'a1') + 1));
    expect([first.from, first.to]).toEqual([at(tableDoc, 'a1'), at(tableDoc, 'a1', true)]);
  });

  it('goes to the page from a block selected as a node, from a selection over several blocks, and from an empty block', () => {
    expect(step(flexDoc, (d) => NodeSelection.create(d, at(d, 'intro', true) + 1))).toBeInstanceOf(AllSelection);
    expect(step(flexDoc, (d) => TextSelection.create(d, at(d, 'a1'), at(d, 'a2', true)))).toBeInstanceOf(AllSelection);
    const withEmpty = docOf(p('intro'), { type: 'paragraph' }, p('outro'));
    expect(step(withEmpty, (d) => TextSelection.create(d, at(d, 'intro', true) + 2))).toBeInstanceOf(AllSelection);
  });
});
