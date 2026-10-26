// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { Editor, Node, type JSONContent } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import StarterKit from '@tiptap/starter-kit';
import Document from '@tiptap/extension-document';
import { Paragraph } from '../paragraph/tiptap';
import { CollectionBlockNode } from '../collection/tiptap';
import { DocumentBlockNode } from '../document/tiptap';
import { BlockId } from './blockId';
import { BlockSpacing } from './blockSpacing';
import { replaceBlockKind, setBlockAttrsById } from './blockOps';
import { LiveStyles, setLiveStyles } from '../../capabilities/liveStyles';

// The embedding NodeViews mount with Svelte's client half, which Vitest
// doesn't resolve under jsdom, and write to the editor's live sheet.
vi.mock('svelte', async () => {
  const { resolve } = await import('node:path');
  const { pathToFileURL } = await import('node:url');
  return import(/* @vite-ignore */ pathToFileURL(resolve('node_modules/svelte/src/index-client.js')).href);
});
setLiveStyles(new LiveStyles(document));

// A kind that takes no capability, for what stays behind.
const BareEmbed = Node.create({
  name: 'bareEmbed',
  group: 'block',
  atom: true,
  addAttributes: () => ({ blockId: { default: null }, targetId: { default: null } }),
  parseHTML: () => [{ tag: 'div[data-bare-embed]' }],
  renderHTML: () => ['div', { 'data-bare-embed': '' }],
});

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
      Document.extend({ content: 'block+' }),
      CollectionBlockNode,
      DocumentBlockNode,
      BareEmbed,
      BlockId,
      BlockSpacing,
    ],
    content: { type: 'doc', content },
  });
  return editor;
}

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const surface = { desktop: { bg: 'accent', radius: 'lg' } };
const placement = { desktop: { align: 'center', width: 'reading' } };
const typography = { desktop: { size: 'scale:lg' } };
const spacing = { desktop: { spaceAbove: 32 } };
const collection = (id: string, attrs: Record<string, unknown> = {}): JSONContent => ({ type: 'collectionBlock', attrs: { blockId: id, nodeId: A, ...attrs } });
const p = (id: string): JSONContent => ({ type: 'paragraph', attrs: { blockId: id }, content: [{ type: 'text', text: id }] });
const first = (e: Editor) => e.getJSON().content![1];

describe('replaceBlockKind', () => {
  it('turns a block into another kind with its id, the attrs given and every capability the new kind takes — the rest at the new kind’s defaults', () => {
    const e = make(p('before'), collection('c1', { limit: 5, density: 'compact', surface, placement, typography, spacing }), p('after'));
    expect(replaceBlockKind(e, 'c1', { type: 'documentBlock', attrs: { nodeId: B } })).toBe(true);
    const node = first(e);
    expect(node.type).toBe('documentBlock');
    expect(node.attrs).toMatchObject({ blockId: 'c1', nodeId: B, surface, placement, typography, spacing, variant: 'row' });
    expect(node.attrs).not.toHaveProperty('limit');
    expect(node.attrs).not.toHaveProperty('density');
    expect(e.getJSON().content!.map((n) => n.attrs?.blockId)).toEqual(['before', 'c1', 'after']);
  });

  it('keeps the new block selected', () => {
    const e = make(p('before'), collection('c1'));
    replaceBlockKind(e, 'c1', { type: 'documentBlock', attrs: { nodeId: B } });
    const selection = e.state.selection;
    expect(selection).toBeInstanceOf(NodeSelection);
    expect((selection as NodeSelection).node.attrs.blockId).toBe('c1');
  });

  it('carries a value given for a capability instead of the block’s own', () => {
    const e = make(p('before'), collection('c1', { surface, placement }));
    const narrower = { desktop: { radius: 'lg' } };
    replaceBlockKind(e, 'c1', { type: 'documentBlock', attrs: { nodeId: B }, carry: { surface: narrower } });
    expect(first(e).attrs).toMatchObject({ surface: narrower, placement });
  });

  it('leaves behind what the new kind does not take', () => {
    const e = make(p('before'), collection('c1', { surface, placement, typography, spacing }));
    replaceBlockKind(e, 'c1', { type: 'bareEmbed', attrs: { targetId: B } });
    expect(first(e)).toEqual({ type: 'bareEmbed', attrs: { blockId: 'c1', targetId: B } });
  });

  it('is undone in one step, apart from a change made just before it', () => {
    const e = make(p('before'), collection('c1', { surface }));
    setBlockAttrsById(e, 'c1', { limit: 7 });
    replaceBlockKind(e, 'c1', { type: 'documentBlock', attrs: { nodeId: B } });
    e.commands.undo();
    expect(first(e)).toMatchObject({ type: 'collectionBlock', attrs: { blockId: 'c1', nodeId: A, limit: 7, surface } });
    e.commands.undo();
    expect(first(e).attrs?.limit).toBeNull();
  });

  it('changes nothing for a block or a kind that is not there', () => {
    const e = make(p('before'), collection('c1'));
    const before = JSON.stringify(e.getJSON());
    expect(replaceBlockKind(e, 'nope', { type: 'documentBlock', attrs: {} })).toBe(false);
    expect(replaceBlockKind(e, 'c1', { type: 'noSuchKind', attrs: {} })).toBe(false);
    expect(JSON.stringify(e.getJSON())).toBe(before);
  });
});
