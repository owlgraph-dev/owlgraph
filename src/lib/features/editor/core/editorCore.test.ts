// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { JSONContent } from '@tiptap/core';
import { setCustomStyles, type CustomStyleRef } from '$lib/features/content';
import { diffDocs } from '$lib/features/pages';
import { createEditorCore, type EditorCore } from './editorCore.svelte';

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

// A headless editor built from the app's own extension list, without the chrome.
let core: EditorCore | null = null;
afterEach(() => {
  core?.destroy();
  core = null;
  setCustomStyles(null);
});

function mount(...content: JSONContent[]): EditorCore {
  core = createEditorCore();
  core.mount(document.createElement('div'), { doc: { type: 'doc', content } });
  return core;
}

describe('the text-style picker', () => {
  const style = (id: string, kind: 'inline' | 'block', enabled = true): CustomStyleRef => ({
    id,
    className: `cs-${id}`,
    label: `Style ${id}`,
    kind,
    stylesheet: 'Sheet',
    enabled,
  });

  it('offers the enabled inline styles and never a block style', () => {
    setCustomStyles([style('lead', 'inline'), style('band', 'block'), style('off', 'inline', false)]);
    core = createEditorCore();
    expect(core.format.customStyleOptions().map((s) => s.id)).toEqual(['lead']);
  });
});

describe('text colour reset', () => {
  // A colour lives on the block (set with a caret) or on a run of text (a mark).
  const red = (text: string): JSONContent => ({ type: 'text', text, marks: [{ type: 'typographyColor', attrs: { color: '#dc2626' } }] });
  // A stored block carries its id, which is what makes it the selection's target.
  const colored = (): JSONContent => ({
    type: 'paragraph',
    attrs: { blockId: 'para-1', typography: { desktop: { color: '#2563eb' } } },
    content: [red('Coloured words'), { type: 'text', text: ' and plain ones' }],
  });
  const colorMarks = (c: EditorCore) => {
    let count = 0;
    c.editor!.state.doc.descendants((node) => {
      if (node.isText && node.marks.some((mk) => mk.type.name === 'typographyColor')) count++;
    });
    return count;
  };

  it("the block's Default also removes the colour set on text inside it", () => {
    const c = mount(colored());
    c.editor!.commands.setTextSelection(1);
    // The colour field's hint: some text here has its own colour.
    expect(c.format.blockScope).toBe(true);
    expect(c.format.inlineColors).toBe(true);
    expect(colorMarks(c)).toBe(1);

    // The colour field's Default picks null.
    c.format.setField('color', null);
    expect(colorMarks(c)).toBe(0);
    expect(c.editor!.state.doc.firstChild!.attrs.typography?.desktop?.color).toBeUndefined();
    expect(c.format.inlineColors).toBe(false);

    // One step: undo brings back both.
    c.editor!.commands.undo();
    expect(colorMarks(c)).toBe(1);
    expect(c.editor!.state.doc.firstChild!.attrs.typography?.desktop?.color).toBe('#2563eb');
  });

  it('Clear on part of a colored run removes the colour from the whole run', () => {
    const c = mount(colored());
    c.editor!.commands.setTextSelection({ from: 1, to: 5 });
    expect(c.editor!.state.doc.textBetween(1, 5)).toBe('Colo');
    expect(c.format.blockScope).toBe(false);
    expect(colorMarks(c)).toBe(1);

    // The mark fields' Clear picks null.
    c.format.setField('color', null);
    expect(colorMarks(c)).toBe(0);
    // A selection's Clear is the run's, not the block's: its own colour stays.
    expect(c.editor!.state.doc.firstChild!.attrs.typography?.desktop?.color).toBe('#2563eb');
  });
});

describe('a document as the editor holds it', () => {
  // A page as an agent or the API stores it: each block with only what it
  // says, without the defaults the editor gives it.
  const sparse = (): JSONContent => ({
    type: 'doc',
    content: [
      { type: 'paragraph', attrs: { blockId: 'p-1' }, content: [{ type: 'text', text: 'First' }] },
      { type: 'callout', attrs: { blockId: 'c-1' }, content: [{ type: 'paragraph', attrs: { blockId: 'p-2' }, content: [{ type: 'text', text: 'Note' }] }] },
      { type: 'quickLink', attrs: { blockId: 'r-1', refType: 'url', url: 'https://example.com', label: 'Docs' } },
    ],
  });
  const changed = (diff: ReturnType<typeof diffDocs>) => diff.entries.filter((e) => e.status !== 'unchanged').map((e) => e.blockId);

  it('compares with the editor’s own document block by block, alike where nothing was changed', () => {
    const c = mount(...(sparse().content ?? []));
    // Read as it came, every block differs from the editor's: the editor gave each its defaults.
    expect(changed(diffDocs(sparse(), c.docJSON()))).not.toEqual([]);
    expect(changed(diffDocs(c.heldJSON(sparse()), c.docJSON()))).toEqual([]);
  });

  it('tells the one block an edit changed from the ones it did not', () => {
    const c = mount(...(sparse().content ?? []));
    c.editor!.commands.setTextSelection(1);
    c.editor!.commands.insertContent('Edited ');
    expect(changed(diffDocs(c.heldJSON(sparse()), c.docJSON()))).toEqual(['p-1']);
  });

  it('reads an empty cell alike on both sides, whatever placeholder each read gave it', () => {
    // The editor fills each empty cell with a placeholder of its own on every
    // read, which is never stored.
    const page = (): JSONContent => ({
      type: 'doc',
      attrs: { layout: { mode: 'columns', template: { desktop: [3, 2], tablet: [3, 2], phone: [1] } } },
      content: [
        { type: 'pageSection', attrs: { blockId: 's-1' }, content: [
          { type: 'gridCell', content: [{ type: 'paragraph', attrs: { blockId: 'p-1' }, content: [{ type: 'text', text: 'First' }] }] },
          { type: 'gridCell', content: [] },
        ] },
        { type: 'pageSection', attrs: { blockId: 's-2' }, content: [
          { type: 'gridCell', content: [{ type: 'paragraph', attrs: { blockId: 'p-2' }, content: [{ type: 'text', text: 'Second' }] }] },
          { type: 'gridCell', content: [] },
        ] },
        { type: 'pageSection', attrs: { blockId: 's-3' }, content: [
          { type: 'gridCell', content: [{ type: 'flexContainer', attrs: { blockId: 'f-1' }, content: [
            { type: 'flexCell', content: [{ type: 'paragraph', attrs: { blockId: 'p-3' }, content: [{ type: 'text', text: 'In a cell' }] }] },
            { type: 'flexCell', content: [] },
          ] }] },
          { type: 'gridCell', content: [{ type: 'paragraph', attrs: { blockId: 'p-4' }, content: [{ type: 'text', text: 'Aside' }] }] },
        ] },
      ],
    });
    core = createEditorCore();
    core.mount(document.createElement('div'), { doc: page() });
    const c = core;
    expect(changed(diffDocs(c.heldJSON(page()), c.docJSON()))).toEqual([]);
    // Into the first section's paragraph.
    c.editor!.commands.setTextSelection(3);
    c.editor!.commands.insertContent('Edited ');
    expect(changed(diffDocs(c.heldJSON(page()), c.docJSON()))).toEqual(['s-1']);
  });

  it('leaves a document it cannot read as it came', () => {
    const c = mount(...(sparse().content ?? []));
    const broken = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text' }] }] };
    expect(c.heldJSON(broken)).toBe(broken);
  });
});

const text = (t: string, marks?: JSONContent['marks']): JSONContent => ({ type: 'text', text: t, ...(marks ? { marks } : {}) });
const para = (blockId: string, t: string): JSONContent => ({ type: 'paragraph', attrs: { blockId }, content: [text(t)] });
const cell = (...content: JSONContent[]): JSONContent => ({ type: 'gridCell', content });
const grid = (blockId: string, ...cells: JSONContent[]): JSONContent => ({ type: 'grid', attrs: { blockId, columnWidths: cells.map(() => 1) }, content: cells });
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
const chainTypes = (c: EditorCore) => c.selection.chain.map((e) => e.type);

describe('the selection', () => {
  it('keeps an ancestor picked by select-parent through an edit of its attributes', () => {
    const c = mount(grid('g-1', cell(para('p-1', 'Note'))));
    c.editor!.commands.setTextSelection(inside(c, 'p-1') + 1);
    expect(chainTypes(c)).toEqual(['page', 'grid', 'gridCell', 'paragraph']);
    expect(c.selection.selected?.id).toBe('p-1');

    c.selection.selectAncestor(1);
    expect(c.selection.index).toBe(1);
    expect(c.selection.selected?.id).toBe('g-1');

    c.updateSelectedAttr('width', 'wide');
    expect(c.selection.index).toBe(1);
    expect(c.selection.selected).toMatchObject({ id: 'g-1', attrs: { width: 'wide' } });

    // Moving the caret lets go of the ancestor.
    c.editor!.commands.setTextSelection(inside(c, 'p-1') + 3);
    expect(c.selection.selected?.id).toBe('p-1');
  });

  it('selects the page itself at the root, with no block selected, until the caret moves', () => {
    const c = mount(para('p-1', 'First'), para('p-2', 'Second'));
    c.editor!.commands.setTextSelection(inside(c, 'p-1') + 1);

    c.selection.selectAncestor(0);
    expect(c.selection.index).toBe(0);
    expect(c.selection.chain[0].type).toBe('page');
    expect(c.selection.selected).toBeNull();

    c.setPageAttr('surface', { background: 'accent' });
    expect(c.selection.index).toBe(0);
    expect(c.editor!.state.doc.attrs.surface).toEqual({ background: 'accent' });

    c.editor!.commands.setTextSelection(inside(c, 'p-2') + 1);
    expect(c.selection.selected?.id).toBe('p-2');
  });

  it("gives the cell and the container the caret is in, an outer cell's own when the outer cell is selected", () => {
    // The outer cell's first block is a grid of its own, so the caret stays in it.
    const c = mount(grid('g-1', cell(grid('g-2', cell(para('p-2', 'Inner'))), para('p-1', 'Outer')), cell(para('p-3', 'Beside'))));
    c.editor!.commands.setTextSelection(inside(c, 'p-2') + 1);
    expect(chainTypes(c)).toEqual(['page', 'grid', 'gridCell', 'grid', 'gridCell', 'paragraph']);
    const [, outerGrid, outerCell, innerGrid, innerCell] = c.selection.chain;

    expect(c.selection.cell?.type).toBe('gridCell');
    expect(c.selection.cell?.pos).toBe(innerCell.pos);
    expect(c.selection.container?.attrs.blockId).toBe('g-2');
    expect(c.selection.container?.pos).toBe(innerGrid.pos);

    c.selection.selectAncestor(2);
    expect(c.selection.index).toBe(2);
    expect(c.selection.cell?.pos).toBe(outerCell.pos);
    expect(c.selection.container?.attrs.blockId).toBe('g-1');
    expect(c.selection.container?.pos).toBe(outerGrid.pos);
  });

  it('tells a selected grid whether a column or a row can go', () => {
    const c = mount(grid('g-1', cell(para('p-1', 'Left')), cell(para('p-2', 'Right'))));
    c.editor!.commands.setTextSelection(inside(c, 'p-1') + 1);
    expect(c.selection.containerGuards).toBeNull();

    c.selection.selectAncestor(1);
    expect(c.selection.selected?.type).toBe('grid');
    expect(c.selection.containerGuards).toEqual({ canRemoveCol: true, canRemoveRow: false });
    expect(c.selection.flexGuards).toBeNull();
    expect(c.selection.tableGuards).toBeNull();
  });

  it('hands out a new selected object after every transaction, the same block or not', () => {
    // What reads the document beside it (the section moves) recomputes on it.
    const c = mount(para('p-1', 'Hello'));
    c.editor!.commands.setTextSelection(inside(c, 'p-1') + 1);
    const before = c.selection.selected;
    c.editor!.commands.insertContent('x');
    expect(c.selection.selected?.id).toBe('p-1');
    expect(c.selection.selected).not.toBe(before);
  });
});

describe('links and quick-link cards', () => {
  const linkOf = (c: EditorCore, mark: string) => {
    let found: { text: string; attrs: Record<string, unknown> } | null = null;
    c.editor!.state.doc.descendants((node) => {
      const mk = node.isText ? node.marks.find((x) => x.type.name === mark) : null;
      if (mk && !found) found = { text: node.text ?? '', attrs: mk.attrs };
    });
    return found as { text: string; attrs: Record<string, unknown> } | null;
  };

  it('links the text the picker opened over, or inserts the title at a caret', () => {
    const c = mount(para('p-1', 'Read more'));
    const at = inside(c, 'p-1');
    c.links.range = { from: at, to: at + 4 };
    c.links.choosePick({ type: 'page', id: 'pg-2', slug: 'other', title: 'Other page' });
    expect(linkOf(c, 'pageLink')).toEqual({ text: 'Read', attrs: expect.objectContaining({ targetPageId: 'pg-2', targetSlug: 'other' }) });

    c.links.range = { from: at + 9, to: at + 9 };
    c.links.choosePick({ type: 'document', id: 'd-1', title: 'Minutes' });
    expect(linkOf(c, 'docLink')).toEqual({ text: 'Minutes', attrs: expect.objectContaining({ targetDocId: 'd-1' }) });
  });

  it('retargets a quick-link card instead, once', () => {
    const c = mount({ type: 'quickLink', attrs: { blockId: 'r-1', refType: 'url', url: 'https://example.com', label: 'Docs' } });
    c.links.retargetId = 'r-1';
    c.links.choosePick({ type: 'document', id: 'd-1', title: 'Minutes' });
    expect(c.editor!.state.doc.firstChild!.attrs).toMatchObject({ refType: 'document', targetDocId: 'd-1', label: 'Minutes' });
    expect(c.links.retargetId).toBeNull();
  });

  it('inserts a card for a typed address, made absolute and labelled without its scheme', () => {
    const c = mount(para('p-1', 'Hello'));
    const at = inside(c, 'p-1') + 5;
    c.links.range = { from: at, to: at };
    c.links.insertUrlCard('example.org/docs/');
    const cards: Record<string, unknown>[] = [];
    c.editor!.state.doc.descendants((node) => {
      if (node.type.name === 'quickLink') cards.push(node.attrs);
    });
    expect(cards).toEqual([expect.objectContaining({ refType: 'url', url: 'https://example.org/docs/', label: 'example.org/docs' })]);
  });
});

describe('property and parameter marks', () => {
  const marks = (c: EditorCore) => {
    const found: { text: string; attrs: Record<string, unknown> }[] = [];
    c.editor!.state.doc.descendants((node) => {
      const mk = node.isText ? node.marks.find((x) => x.type.name === 'semanticProperty') : null;
      if (mk) found.push({ text: node.text ?? '', attrs: mk.attrs });
    });
    return found;
  };

  it('marks the selected text as a property value, which the page then holds', () => {
    const c = mount(para('p-1', 'Friday'));
    const at = inside(c, 'p-1');
    c.properties.range = { from: at, to: at + 6 };
    c.properties.applyProp(' core:deadline ');
    expect(marks(c)).toEqual([{ text: 'Friday', attrs: expect.objectContaining({ propName: 'core:deadline' }) }]);
    expect(c.properties.pageProperties).toEqual([{ name: 'core:deadline', value: 'Friday' }]);
  });

  it('marks a template parameter in its group with its type, never a page property', () => {
    const c = mount(para('p-1', 'Hello'));
    const at = inside(c, 'p-1') + 5;
    c.properties.range = { from: at, to: at };
    c.properties.applyParam('package', 'text');
    expect(marks(c)).toEqual([{ text: 'package', attrs: expect.objectContaining({ propName: 'parameter:package', paramType: 'text' }) }]);
    expect(c.properties.pageProperties).toEqual([]);
  });

  it("leaves a query block's marks out of the page's properties", () => {
    const value = (t: string, propName: string) => text(t, [{ type: 'semanticProperty', attrs: { propName } }]);
    const c = mount(
      { type: 'paragraph', attrs: { blockId: 'p-1' }, content: [value('Ada', 'core:owner')] },
      { type: 'queryBlock', attrs: { blockId: 'q-1', format: 'template' }, content: [grid('g-1', cell({ type: 'paragraph', attrs: { blockId: 'p-2' }, content: [value('Name', 'core:title')] }))] }
    );
    c.properties.refresh();
    expect(c.properties.pageProperties).toEqual([{ name: 'core:owner', value: 'Ada' }]);
  });
});

describe('uploaded images', () => {
  it('inserts an uploaded image and gives back its block id', async () => {
    core = createEditorCore();
    const uploads: string[] = [];
    core.mount(document.createElement('div'), {
      doc: { type: 'doc', content: [para('p-1', 'Hello')] },
      onUploadImage: async (file) => {
        uploads.push(file.name);
        return { id: 'asset-1' };
      },
    });
    const c = core;
    c.editor!.commands.setTextSelection(inside(c, 'p-1') + 5);

    expect(await c.insertUploadedImage(new File(['x'], 'notes.txt', { type: 'text/plain' }))).toBeNull();
    const id = await c.insertUploadedImage(new File(['x'], 'photo.png', { type: 'image/png' }));
    expect(uploads).toEqual(['photo.png']);
    const images: Record<string, unknown>[] = [];
    c.editor!.state.doc.descendants((node) => {
      if (node.type.name === 'image') images.push(node.attrs);
    });
    expect(images).toEqual([expect.objectContaining({ assetId: 'asset-1', blockId: id })]);
    expect(id).toEqual(expect.any(String));
  });
});

describe('unsaved work', () => {
  it('is what changed since the last load or save', () => {
    const c = mount(para('p-1', 'Hello'));
    expect(c.isDirty()).toBe(false);
    c.editor!.commands.setTextSelection(inside(c, 'p-1') + 5);
    c.editor!.commands.insertContent('!');
    expect(c.isDirty()).toBe(true);
    c.markSaved(c.docJSON());
    expect(c.isDirty()).toBe(false);
  });

  it('names an unknown block the author deleted since, and none after a save', () => {
    const c = mount(para('p-1', 'Hello'), { type: 'futureBlock', attrs: { blockId: 'u-1' } });
    expect(c.removedUnknown(c.docJSON())).toEqual([]);
    c.editor!.commands.setTextSelection(inside(c, 'p-1') + 1);
    c.editor!.commands.setNodeSelection(c.editor!.state.doc.firstChild!.nodeSize);
    expect(c.selection.selected?.id).toBe('u-1');
    c.removeSelectedBlock();
    const json = c.docJSON();
    expect(JSON.stringify(json)).not.toContain('futureBlock');
    expect(c.removedUnknown(json)).toEqual(['u-1']);
    c.markSaved(json);
    expect(c.removedUnknown(c.docJSON())).toEqual([]);
  });
});
