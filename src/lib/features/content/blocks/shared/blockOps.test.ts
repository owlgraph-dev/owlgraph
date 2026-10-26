// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { Editor, type JSONContent } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Document from '@tiptap/extension-document';
import { Paragraph } from '../paragraph/tiptap';
import { Heading } from '../heading/tiptap';
import { Placeholder } from '../placeholder/tiptap';
import { Grid, GridCell } from '../grid/tiptap';
import { FlexContainer, FlexCell } from '../flex/tiptap';
import { BlockId } from './blockId';
import { deleteBlockById, moveBlockById, canDropRelative, moveBlockRelative } from './blockOps';
import { LiveStyles, setLiveStyles } from '../../capabilities/liveStyles';

// The grid and flex NodeViews mount with Svelte's client half, which Vitest
// doesn't resolve under jsdom, and write to the editor's live sheet.
vi.mock('svelte', async () => {
  const { resolve } = await import('node:path');
  const { pathToFileURL } = await import('node:url');
  return import(/* @vite-ignore */ pathToFileURL(resolve('node_modules/svelte/src/index-client.js')).href);
});
setLiveStyles(new LiveStyles(document));

// Real node definitions: the operations' edge cases come from what the schema
// lets a cell, a list and the doc hold.

// The grid's NodeView watches its own size; jsdom has no layout to report.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});

function make(...content: JSONContent[]): Editor {
  editor = new Editor({
    extensions: [
      StarterKit.configure({ codeBlock: false, document: false, bold: false, paragraph: false, heading: false }),
      Paragraph,
      Heading,
      Placeholder.configure({ interactive: false }),
      Document.extend({ content: '(block | grid | flexContainer)+' }),
      Grid.configure({ interactive: false }),
      GridCell,
      FlexContainer,
      FlexCell,
      BlockId,
    ],
    content: { type: 'doc', content },
  });
  return editor;
}

const p = (id: string): JSONContent => ({ type: 'paragraph', attrs: { blockId: id }, content: [{ type: 'text', text: id }] });
const li = (id: string): JSONContent => ({ type: 'listItem', attrs: { blockId: id }, content: [p(`${id}-text`)] });
const list = (id: string, ...items: JSONContent[]): JSONContent => ({ type: 'bulletList', attrs: { blockId: id }, content: items });
const cell = (...blocks: JSONContent[]): JSONContent => ({ type: 'gridCell', content: blocks });
const grid = (id: string, ...cells: JSONContent[]): JSONContent => ({
  type: 'grid',
  attrs: { blockId: id, columnWidths: cells.map(() => 1) },
  content: cells,
});

/** The doc as a tree of block ids (a cell as `cell`, which has none, a placeholder as `_`), list items' own paragraphs left out. */
function tree(e: Editor): unknown[] {
  const walk = (nodes: JSONContent[] = []): unknown[] =>
    nodes.map((n) => {
      if (n.type === 'placeholder') return '_';
      const id = n.type === 'gridCell' ? 'cell' : (n.attrs?.blockId as string);
      if (n.type === 'paragraph' || n.type === 'listItem') return id;
      return { [id]: walk(n.content) };
    });
  return walk(e.getJSON().content);
}

describe('deleteBlockById', () => {
  it('removes a block among its siblings', () => {
    const e = make(p('a'), p('b'), p('c'));
    deleteBlockById(e, 'b');
    expect(tree(e)).toEqual(['a', 'c']);
  });

  it("leaves a placeholder in a cell it empties, which may not stand empty", () => {
    const e = make(grid('g', cell(p('a')), cell(p('b'))));
    deleteBlockById(e, 'a');
    expect(tree(e)).toEqual([{ g: [{ cell: ['_'] }, { cell: ['b'] }] }]);
  });

  it('removes a list with its last item, since a list cannot be empty', () => {
    const e = make(p('a'), list('l', li('i1')));
    deleteBlockById(e, 'i1');
    expect(tree(e)).toEqual(['a']);
  });

  it("puts a placeholder where that list was its container's only block", () => {
    const e = make(grid('g', cell(list('l', li('i1')))));
    deleteBlockById(e, 'i1');
    expect(tree(e)).toEqual([{ g: [{ cell: ['_'] }] }]);
  });

  it('keeps the list while other items remain', () => {
    const e = make(list('l', li('i1'), li('i2')));
    deleteBlockById(e, 'i1');
    expect(tree(e)).toEqual([{ l: ['i2'] }]);
  });

  it('ignores an id that is not in the doc', () => {
    const e = make(p('a'));
    deleteBlockById(e, 'nope');
    expect(tree(e)).toEqual(['a']);
  });
});

describe('moveBlockById', () => {
  it('swaps a block with its neighbour, either way', () => {
    const e = make(p('a'), p('b'), p('c'));
    moveBlockById(e, 'b', -1);
    expect(tree(e)).toEqual(['b', 'a', 'c']);
    moveBlockById(e, 'b', 1);
    expect(tree(e)).toEqual(['a', 'b', 'c']);
  });

  it('stays put at either end of its parent, never leaving it', () => {
    const e = make(grid('g', cell(p('a'), p('b'))), p('c'));
    moveBlockById(e, 'a', -1);
    moveBlockById(e, 'b', 1);
    expect(tree(e)).toEqual([{ g: [{ cell: ['a', 'b'] }] }, 'c']);
  });

  it('selects the moved block at its new place', () => {
    const e = make(p('a'), p('b'));
    moveBlockById(e, 'b', -1);
    expect(e.state.selection.$from.parent.attrs.blockId).toBe('b');
  });
});

describe('canDropRelative', () => {
  it('allows a block before or after another, across parents', () => {
    const e = make(p('a'), grid('g', cell(p('b'))));
    expect(canDropRelative(e, 'a', 'b', 'before')).toBe(true);
    expect(canDropRelative(e, 'b', 'a', 'after')).toBe(true);
  });

  it('refuses a block onto itself or into its own range', () => {
    const e = make(grid('g', cell(p('a'))), p('b'));
    expect(canDropRelative(e, 'b', 'b', 'before')).toBe(false);
    expect(canDropRelative(e, 'g', 'a', 'after')).toBe(false);
  });

  it('refuses what the destination may not hold', () => {
    // A list item belongs in a list, never beside top-level paragraphs.
    const e = make(p('a'), list('l', li('i1'), li('i2')));
    expect(canDropRelative(e, 'i1', 'a', 'after')).toBe(false);
    expect(canDropRelative(e, 'i1', 'i2', 'after')).toBe(true);
  });

  it('refuses an id that is not in the doc', () => {
    const e = make(p('a'));
    expect(canDropRelative(e, 'nope', 'a', 'before')).toBe(false);
  });
});

describe('moveBlockRelative', () => {
  it('moves a block into an empty cell, which gives up its placeholder', () => {
    // An empty cell's drop target is its placeholder, which carries an id.
    const e = make(p('a'), p('b'), grid('g', cell({ type: 'placeholder', attrs: { blockId: 'ph' } })));
    moveBlockRelative(e, 'a', 'ph', 'before');
    expect(tree(e)).toEqual(['b', { g: [{ cell: ['a'] }] }]);
  });

  it('leaves a placeholder in the cell it empties, and fills the one it lands in', () => {
    const e = make(grid('g', cell(p('a')), cell(p('b'))));
    moveBlockRelative(e, 'a', 'b', 'after');
    expect(tree(e)).toEqual([{ g: [{ cell: ['_'] }, { cell: ['b', 'a'] }] }]);
  });

  it('takes the whole list away with its only item', () => {
    const e = make(p('a'), list('l', li('i1')), list('m', li('j1')));
    moveBlockRelative(e, 'i1', 'j1', 'before');
    expect(tree(e)).toEqual(['a', { m: ['i1', 'j1'] }]);
  });

  it('does nothing when the drop is not allowed', () => {
    const e = make(p('a'), list('l', li('i1'), li('i2')));
    moveBlockRelative(e, 'i1', 'a', 'after');
    expect(tree(e)).toEqual(['a', { l: ['i1', 'i2'] }]);
  });
});
