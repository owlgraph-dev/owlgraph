// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The table's nodes and NodeView (docs/architecture/blocks/anatomy.md). The
// editor must register them, or a table written over MCP is stripped on load.
import { Node, mergeAttributes } from '@tiptap/core';
import { spacingAttr } from '../../capabilities/spacing/spacing';
import { surfaceAttr } from '../../capabilities/surface/surface';
import { getBlockDefaults } from '../../capabilities/defaults/defaultsRegistry';
import { styleAttr } from '../../capabilities/overrides';
import { svelteNodeView } from '../scaffold/svelteNodeView.svelte';
import { cellStyle, rowStyle } from './tableStyle';
import { atCellBoundary, moveCell, moveRow } from './operations';
import { tableProps, tableWrapper } from './view';
import TableView from './Table.svelte';

export const TableCell = Node.create({
  name: 'tableCell',
  content: 'inline*',
  // Keeps join and lift from reaching across cells; the keyboard moves below
  // dispatch their own selections, so isolating doesn't stop them.
  isolating: true,

  addAttributes() {
    return {
      isHeader: {
        default: false,
        // Here, not in a rule's getAttrs: an attribute's own parseHTML wins.
        parseHTML: (el: HTMLElement) => el.tagName === 'TH',
        renderHTML: () => ({}),
      },
      spacing: spacingAttr(),
      surface: surfaceAttr(),
    };
  },

  parseHTML() {
    return [
      { tag: 'th' },
      { tag: 'td' },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const tag = node.attrs.isHeader ? 'th' : 'td';
    const style = styleAttr(cellStyle(node.attrs, getBlockDefaults()));
    const attrs: Record<string, unknown> = { class: 'grp-containers cap-spacing cap-surface', ...(style ? { style } : {}) };
    if (node.attrs.isHeader) attrs.scope = 'col';
    return [tag, mergeAttributes(HTMLAttributes, attrs), 0];
  },

  addStorage() {
    return { capabilities: ['spacing', 'surface'] };
  },

  addKeyboardShortcuts() {
    return {
      Tab: ({ editor }) => moveCell(editor, 1),
      'Shift-Tab': ({ editor }) => moveCell(editor, -1),
      ArrowDown: ({ editor }) => editor.state.selection.empty && atCellBoundary(editor, 'end') && moveRow(editor, 1),
      ArrowUp: ({ editor }) => editor.state.selection.empty && atCellBoundary(editor, 'start') && moveRow(editor, -1),
      // The schema lets a row gain or lose cells, so the default Enter and
      // Backspace would split or join them. These shortcuts are global, not
      // scoped to the node, so each returns true only in a table cell
      // (Backspace and Delete only at its edge).
      Enter: ({ editor }) => moveRow(editor, 1),
      Backspace: ({ editor }) => editor.state.selection.empty && atCellBoundary(editor, 'start'),
      Delete: ({ editor }) => editor.state.selection.empty && atCellBoundary(editor, 'end'),
    };
  },
});

export const TableRow = Node.create({
  name: 'tableRow',
  content: 'tableCell+',
  isolating: true,

  addAttributes() {
    return {
      isHeader: {
        default: false,
        parseHTML: (el: HTMLElement) => el.hasAttribute('data-header-row'),
        renderHTML: (attrs: Record<string, unknown>) => (attrs.isHeader ? { 'data-header-row': '' } : {}),
      },
      // Min-height, px.
      height: {
        default: null,
        parseHTML: (el: HTMLElement) => {
          const v = Number(el.getAttribute('data-row-height'));
          return Number.isFinite(v) && v > 0 ? v : null;
        },
        renderHTML: (attrs: Record<string, unknown>) => (attrs.height != null ? { 'data-row-height': String(attrs.height) } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'tr' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const style = styleAttr(rowStyle(node.attrs));
    return ['tr', mergeAttributes(HTMLAttributes, style ? { style } : {}), 0];
  },
});

export const Table = Node.create({
  name: 'table',
  group: 'block',
  content: 'tableRow+',
  draggable: true,
  isolating: true,

  addAttributes() {
    return {
      // Weights, drawn as <col> percents (tableStyle.ts).
      columnWidths: {
        default: null,
        parseHTML: (el: HTMLElement) => {
          const raw = el.getAttribute('data-col-widths');
          return raw ? raw.split(',').map((n) => Number(n) || 1) : null;
        },
        renderHTML: (attrs: Record<string, unknown>) =>
          Array.isArray(attrs.columnWidths) ? { 'data-col-widths': (attrs.columnWidths as number[]).join(',') } : {},
      },
      showHeader: {
        default: true,
        parseHTML: (el: HTMLElement) => !el.hasAttribute('data-no-header'),
        renderHTML: (attrs: Record<string, unknown>) => (attrs.showHeader === false ? { 'data-no-header': '' } : {}),
      },
      blockId: { default: null },
      // No spacing: the block is the grid; padding belongs to the cells.
      surface: surfaceAttr(),
    };
  },

  parseHTML() {
    return [{ tag: 'table[data-block-table]' }];
  },

  // What the clipboard carries; the live editor draws the NodeView.
  renderHTML({ HTMLAttributes }) {
    return ['table', mergeAttributes(HTMLAttributes, { 'data-block-table': '' }), ['tbody', 0]];
  },

  addOptions() {
    // false in the phone editor: no resize handles (docs/architecture/editor.md).
    return { interactive: true };
  },

  addStorage() {
    return { capabilities: ['surface'] };
  },

  // The empty <tbody> is ProseMirror's (`content`). The table's and columns'
  // override sets go through the editor's live sheet, as on the page; rows
  // and cells keep their renderHTML style.
  addNodeView() {
    const interactive = this.options.interactive;
    return svelteNodeView(TableView, {
      wrapper: (node) => tableWrapper(node.attrs),
      props: (node, { styles, view }) =>
        tableProps(node.attrs, node.childCount ? node.child(0).childCount : 1, (set) => styles.add(set), getBlockDefaults(), null, interactive ? view : null),
      content: (root) => root.querySelector<HTMLElement>('tbody[data-table-body]')!,
    });
  },
});
