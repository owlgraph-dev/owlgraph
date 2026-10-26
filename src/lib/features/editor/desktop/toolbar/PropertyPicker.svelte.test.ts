// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page as screen, userEvent } from '@vitest/browser/context';
import type { JSONContent } from '@tiptap/core';
import { createEditorCore, type EditorCore } from '../../core/editorCore.svelte';
import { EditorOverlays } from '../overlays.svelte';
import PropertyPicker from './PropertyPicker.svelte';

// The toolbar's property picker over a headless editor: what it marks, what
// it refuses, and the group it keeps between opens.

const GROUPS = [
  { slug: 'core', label: 'Core', description: '' },
  { slug: 'project', label: 'Project', description: '' },
];

let core: EditorCore | null = null;
afterEach(() => {
  core?.destroy();
  core = null;
});

function picker(...content: JSONContent[]) {
  core = createEditorCore();
  const host = document.createElement('div');
  document.body.append(host);
  core.mount(host, { doc: { type: 'doc', content } });
  const c = core;
  render(PropertyPicker, { core: c, overlays: new EditorOverlays(() => false), propertyGroups: GROUPS, toolbarProps: {} });
  /** The text in the block with this id, selected whole. */
  const select = (blockId: string) => {
    c.editor!.state.doc.descendants((node, pos) => {
      if (node.attrs?.blockId !== blockId) return true;
      c.editor!.commands.setTextSelection({ from: pos + 1, to: pos + node.nodeSize - 1 });
      return false;
    });
  };
  const marks = () => {
    const found: { text: string; propName: string }[] = [];
    c.editor!.state.doc.descendants((node) => {
      const mk = node.isText ? node.marks.find((x) => x.type.name === 'semanticProperty') : null;
      if (mk) found.push({ text: node.text ?? '', propName: mk.attrs.propName });
    });
    return found;
  };
  return { core: c, select, marks };
}

const para = (blockId: string, text: string): JSONContent => ({ type: 'paragraph', attrs: { blockId }, content: [{ type: 'text', text }] });

describe("the toolbar's property picker", () => {
  it('marks the selected text as the named property, in the group picked, which it keeps for the next', async () => {
    const { core, select, marks } = picker(para('p-1', 'Friday'), para('p-2', 'Ada'));
    select('p-1');
    await screen.getByRole('button', { name: 'Add semantic property' }).click();
    await userEvent.fill(screen.getByPlaceholder('property name (e.g. deadline)'), 'deadline');
    await screen.getByRole('button', { name: 'Apply' }).click();
    expect(marks()).toEqual([{ text: 'Friday', propName: 'core:deadline' }]);
    expect(core.properties.pageProperties).toEqual([{ name: 'core:deadline', value: 'Friday' }]);
    await expect.element(screen.getByPlaceholder('property name (e.g. deadline)')).not.toBeInTheDocument();

    select('p-2');
    await screen.getByRole('button', { name: 'Add semantic property' }).click();
    await screen.getByRole('combobox', { name: 'Property group' }).click();
    await screen.getByRole('option', { name: 'Project' }).click();
    await userEvent.fill(screen.getByPlaceholder('property name (e.g. deadline)'), 'owner');
    await screen.getByRole('button', { name: 'Apply' }).click();
    expect(marks()).toEqual([
      { text: 'Friday', propName: 'core:deadline' },
      { text: 'Ada', propName: 'project:owner' },
    ]);

    await screen.getByRole('button', { name: 'Add semantic property' }).click();
    await expect.element(screen.getByRole('combobox', { name: 'Property group' })).toHaveTextContent('Project');
  });

  it("refuses a query template's parameter name with a space, says why, and marks nothing", async () => {
    const { select, marks } = picker({
      type: 'queryBlock',
      attrs: { blockId: 'q-1', format: 'template' },
      content: [{ type: 'grid', attrs: { blockId: 'g-1', columnWidths: [1] }, content: [{ type: 'gridCell', content: [para('p-1', 'Name')] }] }],
    });
    select('p-1');
    await screen.getByRole('button', { name: 'Add template parameter' }).click();
    const name = screen.getByRole('textbox', { name: 'Parameter name' });
    await userEvent.fill(name, 'two words');
    await screen.getByRole('button', { name: 'Apply' }).click();

    await expect.element(screen.getByText('Parameter names may only contain letters, numbers, underscores and hyphens (no spaces).')).toBeVisible();
    await expect.element(name).toHaveAttribute('aria-invalid', 'true');
    expect(marks()).toEqual([]);
  });
});
