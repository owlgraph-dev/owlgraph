// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync } from 'svelte';
import { render } from 'vitest-browser-svelte';
import { page as screen, userEvent } from '@vitest/browser/context';
import type { JSONContent } from '@tiptap/core';
import { stubFetch } from '$tests/component/fetch';
import { createEditorCore, type EditorCore } from '../core/editorCore.svelte';
import { BlockEdit } from './blockEdit.svelte';
import BlockEditDialogs from './BlockEditDialogs.svelte';

// The query block's and the quick link's Edit dialogs over a headless
// editor: what they open on and what their Save writes into the block.

const RELATIONSHIP_TYPES = [{ slug: 'cites', label: 'Cites', inverseLabel: null, properties: [{ name: 'page', label: 'Page', datatype: 'text' }] }];

let core: EditorCore | null = null;
afterEach(() => {
  core?.destroy();
  core = null;
  vi.unstubAllGlobals();
});

function dialogs(...content: JSONContent[]) {
  stubFetch(({ url }) => (url.startsWith('/api/relationship-types') ? Response.json({ results: RELATIONSHIP_TYPES }) : undefined));
  core = createEditorCore();
  const host = document.createElement('div');
  document.body.append(host);
  core.mount(host, { doc: { type: 'doc', content } });
  const c = core;
  const edit = new BlockEdit(() => c.editor);
  render(BlockEditDialogs, { edit });
  const attrsOf = (id: string) => {
    let attrs: Record<string, unknown> | null = null;
    c.editor!.state.doc.descendants((node) => {
      if (node.attrs?.blockId === id) attrs = node.attrs;
      return !attrs;
    });
    return attrs as Record<string, any> | null;
  };
  const open = (id: string) => flushSync(() => edit.start(id));
  return { edit, attrsOf, open };
}

describe('the block Edit dialogs', () => {
  it("edit a query block's limit, and leave its result's format options alone", async () => {
    const formatOptions = { spacing: { desktop: { pad: 'md' } } };
    const { edit, attrsOf, open } = dialogs({
      type: 'queryBlock',
      attrs: { blockId: 'q-1', format: 'template', first: 20, formatOptions },
      content: [{ type: 'grid', attrs: { blockId: 'g-1', columnWidths: [1] }, content: [{ type: 'gridCell', content: [{ type: 'paragraph', attrs: { blockId: 'p-1' } }] }] }],
    });
    open('q-1');
    const dialog = screen.getByRole('dialog', { name: 'Edit live query' });
    await expect.element(dialog).toBeVisible();
    const limit = dialog.getByRole('spinbutton', { name: 'Limit' });
    await expect.element(limit).toHaveValue(20);
    await userEvent.fill(limit, '5');
    await dialog.getByRole('button', { name: 'Save' }).click();

    await expect.element(dialog).not.toBeInTheDocument();
    expect(attrsOf('q-1')).toMatchObject({ first: 5, formatOptions });
    expect(edit.open).toBe(false);
  });

  it("edit a quick link's typed edge, starting from the one it stores", async () => {
    const { attrsOf, open } = dialogs({
      type: 'quickLink',
      attrs: { blockId: 'r-1', refType: 'url', url: 'https://example.com', label: 'Docs', relationshipType: 'cites', properties: { page: '12' } },
    });
    open('r-1');
    const dialog = screen.getByRole('dialog', { name: 'Relationship' });
    const field = dialog.getByRole('textbox', { name: 'Page' });
    await expect.element(field).toHaveValue('12');
    await userEvent.fill(field, '14');
    await userEvent.tab();
    await dialog.getByRole('button', { name: 'Save' }).click();

    await expect.element(dialog).not.toBeInTheDocument();
    expect(attrsOf('r-1')).toMatchObject({ relationshipType: 'cites', properties: { page: '14' } });
  });
});
