// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The grid's nodes and NodeView (docs/architecture/blocks/anatomy.md, "Containers without
// chrome"). Cells need no NodeView: their renderHTML is enough.
import { Node, mergeAttributes } from '@tiptap/core';
import { spacingAttr } from '../../capabilities/spacing/spacing';
import { cellStyle } from './gridStyle';
import { surfaceAttr } from '../../capabilities/surface/surface';
import { heightAttr } from '../../capabilities/height/height';
import { typographyAttr } from '../../capabilities/typography/typography';
import { getTypographyRegistry } from '../../capabilities/typography/typographyRegistry';
import { getBlockDefaults } from '../../capabilities/defaults/defaultsRegistry';
import { styleAttr } from '../../capabilities/overrides';
import { placementAttr } from '../../capabilities/placement/placement';
import { svelteNodeView, type SvelteNodeViewContext } from '../scaffold/svelteNodeView.svelte';
import { widthsOf } from './model';
import { boxesOf } from './gridMath';
import { mergeCells, unmergeCell } from './operations';
import { gridRowProps, gridWrapper, type GridEditing } from './view';
import { sectionRowProps, sectionWrapper } from '../section/view';
import GridView from './Grid.svelte';
import GridHandles from './GridHandles.svelte';

type N = any;

// The handles' cue to re-measure: a merge or a structural edit changes it,
// typing in a cell doesn't.
function cellsKeyOf(node: N): string {
  const cols = widthsOf(node).length;
  const attrs: Record<string, unknown>[] = [];
  node.forEach((c: N) => attrs.push(c.attrs));
  return `${cols}|${boxesOf(attrs, cols).map((b) => `${b.colStart},${b.rowStart},${b.colSpan},${b.rowSpan}`).join(';')}`;
}

// One object per view, so a prop that never changes never re-renders the handles.
const editingByView = new WeakMap<object, GridEditing>();
function gridEditing(view: SvelteNodeViewContext['view']): GridEditing {
  let editing = editingByView.get(view);
  if (editing) return editing;
  const { editor, getPos } = view;
  const setAttrs = (patch: Record<string, unknown>, history: boolean) => {
    const pos = getPos();
    const node = typeof pos === 'number' ? editor.state.doc.nodeAt(pos) : null;
    if (typeof pos !== 'number' || !node) return;
    const tr = editor.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...patch });
    if (!history) tr.setMeta('addToHistory', false);
    editor.view.dispatch(tr);
  };
  editing = {
    handles: GridHandles,
    editor,
    getPos,
    merge: (box) => {
      const pos = getPos();
      if (typeof pos === 'number') mergeCells(editor, pos, box);
    },
    unmerge: (cellIndex) => {
      const pos = getPos();
      if (typeof pos === 'number') unmergeCell(editor, pos, cellIndex);
    },
    setColumnWidths: (columnWidths, history) => setAttrs({ columnWidths }, history),
    setRowHeights: (rowHeights, history) => setAttrs({ rowHeights }, history),
  };
  editingByView.set(view, editing);
  return editing;
}

export const GridCell = Node.create({
  name: 'gridCell',
  // Both containers sit outside the 'block' group, so they're named directly,
  // as the doc's own content spec does (editorExtensions.ts).
  content: '(block | grid | flexContainer)+',
  isolating: true,
  addAttributes() {
    const dataAttr = (key: string, name: string) => ({
      default: null,
      parseHTML: (el: HTMLElement) => el.getAttribute(name),
      renderHTML: (attrs: Record<string, unknown>) => (attrs[key] ? { [name]: attrs[key] } : {}),
    });
    // 1-based CSS grid lines. A null colStart/rowStart is row-major auto-flow
    // (boxesOf); the first merge stamps explicit places on every cell (mergeCells).
    const numAttr = (key: string, name: string, dflt: number | null) => ({
      default: dflt,
      parseHTML: (el: HTMLElement) => {
        const v = Number(el.getAttribute(name));
        return Number.isFinite(v) && v >= 1 ? v : dflt;
      },
      renderHTML: (attrs: Record<string, unknown>) =>
        attrs[key] != null && attrs[key] !== dflt ? { [name]: String(attrs[key]) } : {},
    });
    return {
      spacing: spacingAttr(),
      surface: surfaceAttr(),
      typography: typographyAttr(),
      alignX: dataAttr('alignX', 'data-ax'),
      alignY: dataAttr('alignY', 'data-ay'),
      colStart: numAttr('colStart', 'data-col-start', null),
      rowStart: numAttr('rowStart', 'data-row-start', null),
      colSpan: numAttr('colSpan', 'data-col-span', 1),
      rowSpan: numAttr('rowSpan', 'data-row-span', 1),
      // Fills the cell's children to its width and height; overrides alignX/alignY.
      stretch: {
        default: false,
        parseHTML: (el: HTMLElement) => el.hasAttribute('data-stretch'),
        renderHTML: (attrs: Record<string, unknown>) => (attrs.stretch ? { 'data-stretch': '' } : {}),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-grid-cell]' }];
  },
  renderHTML({ node, HTMLAttributes }) {
    const style = styleAttr(cellStyle(node.attrs, getTypographyRegistry(), getBlockDefaults()));
    return ['div', mergeAttributes(HTMLAttributes, { 'data-grid-cell': '', class: 'grid-cell grp-containers cap-spacing cap-surface cap-typography', ...(style ? { style } : {}) }), 0];
  },
  addStorage() {
    return { capabilities: ['spacing', 'surface', 'typography'] };
  },
});

export const Grid = Node.create({
  name: 'grid',
  group: 'layout',
  content: 'gridCell+',
  draggable: true,
  isolating: true,

  // interactive: false (the phone editor) leaves out the resize dividers and
  // the merge selection: an invisible but active touch target is worse than
  // none. bound: true is the page section (section/tiptap.ts), whose columns are the
  // page's template, so it has neither and its style carries no tracks.
  addOptions() {
    return { interactive: true, bound: false };
  },

  addAttributes() {
    const dataAttr = (key: string, name: string) => ({
      default: null,
      parseHTML: (el: HTMLElement) => el.getAttribute(name),
      renderHTML: (attrs: Record<string, unknown>) => (attrs[key] ? { [name]: attrs[key] } : {}),
    });
    const jsonAttr = (key: string, name: string) => ({
      default: null,
      parseHTML: (el: HTMLElement) => {
        try {
          const raw = el.getAttribute(name);
          return raw ? JSON.parse(raw) : null;
        } catch {
          return null;
        }
      },
      renderHTML: (attrs: Record<string, unknown>) => (attrs[key] ? { [name]: JSON.stringify(attrs[key]) } : {}),
    });
    return {
      columnWidths: {
        default: null,
        parseHTML: (el) => {
          const raw = el.getAttribute('data-col-widths');
          return raw ? raw.split(',').map((n) => Number(n) || 1) : null;
        },
        renderHTML: (attrs) =>
          Array.isArray(attrs.columnWidths) ? { 'data-col-widths': attrs.columnWidths.join(',') } : {},
      },
      // Per-row min-height, px; an empty segment or null is auto.
      rowHeights: {
        default: null,
        parseHTML: (el) => {
          const raw = el.getAttribute('data-row-heights');
          if (!raw) return null;
          return raw.split(',').map((n) => (n.trim() === '' ? null : Number(n) || null));
        },
        renderHTML: (attrs) =>
          Array.isArray(attrs.rowHeights)
            ? { 'data-row-heights': attrs.rowHeights.map((n: number | null) => (n ? String(n) : '')).join(',') }
            : {},
      },
      gap: dataAttr('gap', 'data-gap'),
      // Absent: the desktop's columns on a tablet, one column on a phone (gridColumns.ts).
      columnsByTier: jsonAttr('columnsByTier', 'data-cols-tiers'),
      gapByTier: jsonAttr('gapByTier', 'data-gap-tiers'),
      spacing: spacingAttr(),
      surface: surfaceAttr(),
      height: heightAttr(),
      // 'normal' (null) | 'wide' | 'full': the .canvas-blocks breakout rules
      // make a full-bleed band of it.
      width: dataAttr('width', 'data-width'),
      // A page section has none: its place is its span (section/tiptap.ts).
      placement: placementAttr(),
      // Flush against the page top, only as the page's first block
      // (computeFirstBlockBleeds, app.css's .bleed-top).
      bleedToTop: {
        default: false,
        parseHTML: (el: HTMLElement) => el.hasAttribute('data-bleed-top'),
        renderHTML: (attrs: Record<string, unknown>) => (attrs.bleedToTop ? { 'data-bleed-top': '' } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-grid]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-grid': '', class: 'grid grp-containers cap-spacing cap-surface cap-height' }), 0];
  },

  addStorage() {
    return { capabilities: ['spacing', 'surface', 'placement', 'height'] };
  },

  // The row is ProseMirror's (`content`). The wrapper's and the row's override
  // sets go through the editor's live sheet, as on the page; cells keep their
  // renderHTML style.
  addNodeView() {
    const interactive = this.options.interactive;
    const bound: boolean = this.options.bound;
    return svelteNodeView(GridView, {
      wrapper: (node) => (bound ? sectionWrapper(node.attrs) : gridWrapper(node.attrs)),
      props: (node, { styles, view }) =>
        bound
          ? sectionRowProps(node.attrs, (set) => styles.add(set), getBlockDefaults(), null)
          : gridRowProps(node.attrs, (set) => styles.add(set), getBlockDefaults(), null, interactive ? gridEditing(view) : null, cellsKeyOf(node)),
      content: (root) => root.querySelector<HTMLElement>(':scope > .grid')!,
    });
  },
});
