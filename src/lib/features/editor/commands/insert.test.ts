// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { JSONContent } from '@tiptap/core';
import { createEditorCore, type EditorCore } from '../core/editorCore.svelte';
import { insertCommands, appendBlock } from './insert';

// The blocks' Svelte NodeViews mount with Svelte's client half — under
// jsdom, Vitest resolves `svelte` to its server half.
vi.mock('svelte', async () => {
  const { resolve } = await import('node:path');
  const { pathToFileURL } = await import('node:url');
  return import(/* @vite-ignore */ pathToFileURL(resolve('node_modules/svelte/src/index-client.js')).href);
});

// jsdom has none; the grid's and the image's handles observe their boxes.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

let core: EditorCore | null = null;
afterEach(() => {
  core?.destroy();
  core = null;
});

const COLUMNS = { layout: { mode: 'columns', template: { desktop: [1, 1], tablet: [1, 1], phone: [1] } } };
const para = (blockId: string, text: string): JSONContent => ({ type: 'paragraph', attrs: { blockId }, content: [{ type: 'text', text }] });
const section = (blockId: string, ...cells: JSONContent[][]): JSONContent => ({ type: 'pageSection', attrs: { blockId }, content: cells.map((content) => ({ type: 'gridCell', content })) });

function mount(doc: JSONContent): EditorCore {
  core = createEditorCore();
  core.mount(document.createElement('div'), { doc });
  return core;
}
const types = (c: EditorCore) => (c.editor!.getJSON().content ?? []).map((n) => n.type);
/** The position just inside the first text of the block with this id. */
function inside(c: EditorCore, blockId: string): number {
  let at = -1;
  c.editor!.state.doc.descendants((node, pos) => {
    if (at >= 0) return false;
    if (node.attrs?.blockId === blockId) at = pos + 1;
    return at < 0;
  });
  return at;
}
const commandsFor = (c: EditorCore, columnsMode = false, onQuickLink: (id: string) => void = () => {}) =>
  insertCommands(() => c.editor, { columnsMode: () => columnsMode, onQuickLink });

describe('the Insert menu’s commands', () => {
  it('insert at the caret’s nearest level that takes the block', () => {
    const c = mount({ type: 'doc', content: [para('p-1', 'First'), para('p-2', 'Second')] });
    c.editor!.commands.setTextSelection(inside(c, 'p-1') + 5);
    commandsFor(c).callout();
    expect(types(c)).toEqual(['paragraph', 'callout', 'paragraph']);
  });

  it('replace a placeholder in one step, the new block kept selected', () => {
    const c = mount({ type: 'doc', content: [para('p-1', 'First'), { type: 'placeholder' }] });
    const pos = c.editor!.state.doc.firstChild!.nodeSize;
    expect(c.editor!.state.doc.nodeAt(pos)?.type.name).toBe('placeholder');
    const metas: unknown[] = [];
    c.editor!.on('transaction', ({ transaction }) => metas.push(transaction.getMeta('keepSelected')));

    commandsFor(c).grid({ mode: 'replace', pos });
    expect(types(c)).toEqual(['paragraph', 'grid']);
    expect(metas).toContain(pos);
    // The grid itself, not the cell its caret landed in.
    expect(c.selection.selected?.type).toBe('grid');

    c.editor!.commands.undo();
    expect(types(c)).toEqual(['paragraph', 'placeholder']);
  });

  it('put a section after the one the caret is in on a columns page', () => {
    const c = mount({ type: 'doc', attrs: COLUMNS, content: [section('s-1', [para('p-1', 'One')], [para('p-2', 'Two')]), section('s-2', [para('p-3', 'Three')], [para('p-4', 'Four')])] });
    c.editor!.commands.setTextSelection(inside(c, 'p-1') + 1);
    const commands = commandsFor(c, true);
    expect(commands.offersSection()).toBe(true);
    commands.section();
    const ids = (c.editor!.getJSON().content ?? []).map((n) => n.attrs?.blockId);
    expect(types(c)).toEqual(['pageSection', 'pageSection', 'pageSection']);
    expect(ids[0]).toBe('s-1');
    expect(ids[2]).toBe('s-2');
    expect(commandsFor(c, false).offersSection()).toBe(false);
  });

  it('insert a quick-link card and hand its id on, for its picker', () => {
    const c = mount({ type: 'doc', content: [para('p-1', 'First')] });
    c.editor!.commands.setTextSelection(inside(c, 'p-1') + 5);
    const picked: string[] = [];
    commandsFor(c, false, (id) => picked.push(id)).quickLink();
    expect(types(c)).toEqual(['paragraph', 'quickLink']);
    expect(picked).toEqual([c.editor!.state.doc.lastChild!.attrs.blockId]);
  });
});

describe('the append strip', () => {
  it('adds a placeholder at the end of a flow page', () => {
    const c = mount({ type: 'doc', content: [para('p-1', 'First')] });
    appendBlock(c.editor!, false);
    expect(types(c)).toEqual(['paragraph', 'placeholder']);
  });

  it('adds a section at the end of a columns page', () => {
    const c = mount({ type: 'doc', attrs: COLUMNS, content: [section('s-1', [para('p-1', 'One')], [para('p-2', 'Two')])] });
    appendBlock(c.editor!, true);
    expect(types(c)).toEqual(['pageSection', 'pageSection']);
    expect(c.editor!.state.doc.lastChild!.attrs.blockId).not.toBe('s-1');
  });
});
