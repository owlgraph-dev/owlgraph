// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { generateHTML, generateJSON } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Table, TableRow, TableCell } from './tiptap';

// generateHTML / generateJSON take the clipboard's path (renderHTML, then
// parseHTML) without an editor view.
const extensions = [StarterKit, Table, TableRow, TableCell];
const cell = (text: string, isHeader = false) => ({ type: 'tableCell', attrs: { isHeader }, content: [{ type: 'text', text }] });
const table = {
  type: 'table',
  attrs: { columnWidths: [2, 1], showHeader: false },
  content: [
    { type: 'tableRow', attrs: { isHeader: true }, content: [cell('Name', true), cell('Kind', true)] },
    { type: 'tableRow', attrs: { isHeader: false, height: 56 }, content: [cell('a1'), cell('b1')] },
  ],
};

describe('a table on the clipboard', () => {
  it('carries its rows and cells, and comes back with its attrs', () => {
    const html = generateHTML({ type: 'doc', content: [table] }, extensions);
    expect(html).toMatch(/<table[^>]*data-block-table[^>]*><tbody><tr data-header-row/);
    expect(html).toContain('<th');
    const back = generateJSON(html, extensions);
    expect(back.content[0]).toMatchObject({
      type: 'table',
      attrs: { columnWidths: [2, 1], showHeader: false },
      content: [
        { type: 'tableRow', attrs: { isHeader: true }, content: [{ attrs: { isHeader: true }, content: [{ text: 'Name' }] }, { content: [{ text: 'Kind' }] }] },
        { type: 'tableRow', attrs: { isHeader: false, height: 56 }, content: [{ attrs: { isHeader: false }, content: [{ text: 'a1' }] }, { content: [{ text: 'b1' }] }] },
      ],
    });
  });
});
