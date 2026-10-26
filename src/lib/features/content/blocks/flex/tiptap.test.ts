// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { Node, generateHTML, generateJSON } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import StarterKit from '@tiptap/starter-kit';
import { FlexContainer, FlexCell } from './tiptap';

// generateHTML / generateJSON take the clipboard's path without an editor
// view. A row sits outside the 'block' group, so the document names it; the
// grid a cell's content names stands in as a bare node.
const Grid = Node.create({ name: 'grid', group: 'layout', content: 'paragraph+' });
const extensions = [StarterKit.configure({ document: false }), Document.extend({ content: '(block | flexContainer)+' }), Grid, FlexContainer, FlexCell];
const para = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const row = {
  type: 'flexContainer',
  attrs: {
    width: 'wide',
    bleedToTop: true,
    layout: { desktop: { gap: 24, flexWrap: 'wrap' }, phone: { flexDirection: 'column' } },
    placement: { desktop: { align: 'center' } },
    spacing: { desktop: { spaceAbove: 48 } },
    height: { desktop: { min: '240px' } },
  },
  content: [
    { type: 'flexCell', attrs: { flexItem: { desktop: { size: 'fill' } } }, content: [para('one'), para('two')] },
    { type: 'flexCell', content: [{ type: 'flexContainer', content: [{ type: 'flexCell', content: [para('nested')] }] }] },
  ],
};

describe('a flex row on the clipboard', () => {
  it('carries its cells, a row nested in a cell, and comes back with its attrs', () => {
    const html = generateHTML({ type: 'doc', content: [row] }, extensions);
    expect(html).toMatch(/^<div[^>]*data-flex=""[^>]*><div[^>]*data-flex-cell/);
    const back = generateJSON(html, extensions);
    expect(back.content[0]).toMatchObject({
      type: 'flexContainer',
      attrs: row.attrs,
      content: [
        { type: 'flexCell', attrs: { flexItem: { desktop: { size: 'fill' } } }, content: [{ content: [{ text: 'one' }] }, { content: [{ text: 'two' }] }] },
        { type: 'flexCell', content: [{ type: 'flexContainer', content: [{ type: 'flexCell', content: [{ content: [{ text: 'nested' }] }] }] }] },
      ],
    });
  });
});
