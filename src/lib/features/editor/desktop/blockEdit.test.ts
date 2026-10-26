// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { JSONContent } from '@tiptap/core';
import { createEditorCore, type EditorCore } from '../core/editorCore.svelte';
import { BlockEdit } from './blockEdit.svelte';

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

/** A headless editor over these blocks, and the Edit dialogs' state over it. */
function editing(...content: JSONContent[]) {
  core = createEditorCore();
  core.mount(document.createElement('div'), { doc: { type: 'doc', content } });
  const c = core;
  const attrsOf = (id: string) => {
    let attrs: Record<string, unknown> | null = null;
    c.editor!.state.doc.descendants((node) => {
      if (node.attrs?.blockId === id) attrs = node.attrs;
      return !attrs;
    });
    return attrs as Record<string, any> | null;
  };
  return { edit: new BlockEdit(() => c.editor), attrsOf };
}

const para = (blockId: string, t: string): JSONContent => ({ type: 'paragraph', attrs: { blockId }, content: [{ type: 'text', text: t }] });
const html = (blockId: string, markup: string): JSONContent => ({ type: 'htmlBlock', attrs: { blockId, html: markup } });
const template = (...content: JSONContent[]): JSONContent => ({ type: 'grid', attrs: { blockId: 'g-1', columnWidths: [1] }, content: [{ type: 'gridCell', content }] });
const query = (attrs: Record<string, unknown>, ...content: JSONContent[]): JSONContent => ({ type: 'queryBlock', attrs: { blockId: 'q-1', format: 'template', ...attrs }, content: [template(...content)] });

describe("a block's Edit dialog", () => {
  it("opens on an html block's markup, and its Save writes what was typed", () => {
    const { edit, attrsOf } = editing(html('h-1', '<p>Hi</p>'));
    edit.start('h-1');
    expect(edit).toMatchObject({ id: 'h-1', kind: 'html', value: '<p>Hi</p>', htmlInTemplate: false, open: true });
    edit.value = '<p>Hello</p>';
    edit.save();
    expect(attrsOf('h-1')?.html).toBe('<p>Hello</p>');
    expect(edit).toMatchObject({ id: null, kind: null, value: '', open: false });
  });

  it('knows an html block in a query template, whose tokens declare parameters', () => {
    const { edit } = editing(query({}, html('h-1', '{{{name}}}')));
    edit.start('h-1');
    expect(edit.htmlInTemplate).toBe(true);
  });

  it("opens on a diagram's code, and Cancel writes nothing", () => {
    const { edit, attrsOf } = editing({ type: 'diagram', attrs: { blockId: 'd-1', code: 'graph TD; A-->B' } });
    edit.start('d-1');
    expect(edit).toMatchObject({ kind: 'diagram', value: 'graph TD; A-->B' });
    edit.value = 'graph LR; A-->B';
    edit.cancel();
    expect(attrsOf('d-1')?.code).toBe('graph TD; A-->B');
  });

  it("opens on a query block's definition and its parameters, and Save leaves the result's format options alone", () => {
    const formatOptions = { layout: { desktop: { flexDirection: 'row' } } };
    const { edit, attrsOf } = editing(
      query({ first: 5, formatOptions }, { type: 'paragraph', attrs: { blockId: 'p-1' }, content: [{ type: 'text', text: 'Name', marks: [{ type: 'semanticProperty', attrs: { propName: 'parameter:title', paramType: 'text' } }] }] })
    );
    edit.start('q-1');
    expect(edit.kind).toBe('query');
    expect(edit.queryDraft).toMatchObject({ filter: null, traversal: null, fromCurrentPage: false, first: 5, format: 'template' });
    expect(edit.queryParams.map((p) => p.key)).toEqual(['parameter:title']);
    edit.saveQuery({ ...edit.queryDraft!, first: 12 });
    expect(attrsOf('q-1')).toMatchObject({ first: 12, formatOptions });
    expect(edit.open).toBe(false);
  });

  it("opens on a quick link's typed edge, and Save writes the edge", () => {
    const { edit, attrsOf } = editing({ type: 'quickLink', attrs: { blockId: 'r-1', refType: 'url', url: 'https://example.com', label: 'Docs', relationshipType: 'cites', properties: { page: '12' } } });
    edit.start('r-1');
    expect(edit).toMatchObject({ kind: 'quickLink', quickLink: { relationshipType: 'cites', properties: { page: '12' } } });
    edit.saveQuickLink({ relationshipType: 'cites', properties: { page: '14' } });
    expect(attrsOf('r-1')).toMatchObject({ relationshipType: 'cites', properties: { page: '14' } });
  });

  it('opens on nothing for a block without one', () => {
    const { edit } = editing(para('p-1', 'Text'));
    edit.start('p-1');
    expect(edit).toMatchObject({ id: null, kind: null, open: false });
  });
});
