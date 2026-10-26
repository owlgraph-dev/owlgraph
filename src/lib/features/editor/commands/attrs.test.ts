// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { JSONContent } from '@tiptap/core';
import { createEditorCore, type EditorCore } from '../core/editorCore.svelte';
import { setAttrsAt, setFlexLayoutField, setSectionSpan } from './attrs';

// The blocks' Svelte NodeViews mount with Svelte's client half — under
// jsdom, Vitest resolves `svelte` to its server half.
vi.mock('svelte', async () => {
  const { resolve } = await import('node:path');
  const { pathToFileURL } = await import('node:url');
  return import(/* @vite-ignore */ pathToFileURL(resolve('node_modules/svelte/src/index-client.js')).href);
});

let core: EditorCore | null = null;
afterEach(() => {
  core?.destroy();
  core = null;
});

function mount(...content: JSONContent[]): EditorCore {
  core = createEditorCore();
  core.mount(document.createElement('div'), { doc: { type: 'doc', content } });
  return core;
}
const para = (blockId: string, text: string): JSONContent => ({ type: 'paragraph', attrs: { blockId }, content: [{ type: 'text', text }] });

describe('attributes written by position', () => {
  it('merge into what the node has, in one undoable step', () => {
    const c = mount({ type: 'callout', attrs: { blockId: 'c-1', variant: 'info' }, content: [{ type: 'text', text: 'Note' }] });
    setAttrsAt(c.editor!, 0, { variant: 'warning' });
    expect(c.editor!.state.doc.firstChild!.attrs).toMatchObject({ blockId: 'c-1', variant: 'warning' });
    c.editor!.commands.undo();
    expect(c.editor!.state.doc.firstChild!.attrs.variant).toBe('info');
  });

  it('write nothing at no position', () => {
    const c = mount(para('p-1', 'Hello'));
    const before = c.editor!.state.doc;
    setAttrsAt(c.editor!, -1, { blockId: 'other' });
    expect(c.editor!.state.doc).toBe(before);
  });

  it("set one field of a flex row's layout at one tier, leaving the others", () => {
    const c = mount({
      type: 'flexContainer',
      attrs: { blockId: 'f-1', layout: { desktop: { flexDirection: 'row', gap: 16 } } },
      content: [{ type: 'flexCell', content: [para('p-1', 'One')] }],
    });
    setFlexLayoutField(c.editor!, 0, 'tablet', 'flexDirection', 'column');
    const layout = c.editor!.state.doc.firstChild!.attrs.layout;
    expect(layout.desktop).toEqual({ flexDirection: 'row', gap: 16 });
    expect(layout.tablet).toMatchObject({ flexDirection: 'column' });
  });

  it("store a page section's normal span as none", () => {
    const c = mount({ type: 'pageSection', attrs: { blockId: 's-1' }, content: [{ type: 'gridCell', content: [para('p-1', 'One')] }] });
    setSectionSpan(c.editor!, 0, 'wide');
    expect(c.editor!.state.doc.firstChild!.attrs.width).toBe('wide');
    setSectionSpan(c.editor!, 0, 'normal');
    expect(c.editor!.state.doc.firstChild!.attrs.width).toBeNull();
  });
});
