// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The page section (docs/architecture/blocks/layout.md, "Page layout: sections"): Grid
// bound to the page's column template, without what lets a grid own its
// columns. The operations below apply pageSections.ts's transforms as one
// transaction, so one undo step, each.
import { Extension, mergeAttributes, type Editor } from '@tiptap/core';
import { NodeSelection, Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { Fragment } from '@tiptap/pm/model';
import { Grid } from '../grid/tiptap';
import type { JsonNode } from '../../doc/doc';
import { UNKNOWN_BLOCK } from '../../doc/unknownBlocks';
import { pageColumnsOf, setPageColumns, type PageLayout } from '../../page/pageAttrs';
import type { PageColumns } from '../../page/pageColumns';
import {
  changePageColumns,
  makeSectionNode,
  moveInSections,
  normalizeStrays,
  sectionMovesFor,
  setSectionColumns,
  SECTION_TYPE,
  type SectionMerge,
  type SectionMove,
} from '../../page/pageSections';

type N = any;

// A section's columns are the page's, and its place is its span.
const OWNED_COLUMN_ATTRS = ['columnWidths', 'rowHeights', 'gap', 'columnsByTier', 'gapByTier', 'placement'];

export const PageSection = Grid.extend({
  name: SECTION_TYPE,
  group: 'pageSection',

  addOptions() {
    return { ...this.parent?.(), bound: true };
  },

  addAttributes() {
    const attrs = { ...(this.parent?.() ?? {}) } as Record<string, unknown>;
    for (const key of OWNED_COLUMN_ATTRS) delete attrs[key];
    return {
      ...attrs,
      // null = the page's template; 'single' = one column, whatever the page has.
      columns: {
        default: null,
        parseHTML: (el: HTMLElement) => (el.getAttribute('data-columns') === 'single' ? 'single' : null),
        renderHTML: (a: Record<string, unknown>) => (a.columns === 'single' ? { 'data-columns': 'single' } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-page-section]' }];
  },

  addStorage() {
    return { capabilities: ['spacing', 'surface', 'height'] };
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-page-section': '', class: 'grid page-section grp-containers cap-spacing cap-surface cap-height' }), 0];
  },
});

function layoutOf(editor: Editor): PageLayout {
  return (editor.state.doc.attrs.layout ?? {}) as PageLayout;
}

/** The page's columns layout as the editor has it now, or null on a flow page. */
export function editorPageColumns(editor: Editor): PageColumns | null {
  return pageColumnsOf(layoutOf(editor));
}

/** Replaces the document's content, and optionally its layout, as one undo step. */
function replaceDoc(editor: Editor, json: JsonNode, layout?: PageLayout) {
  const { state, view } = editor;
  const content = Fragment.fromArray((json.content ?? []).map((n) => state.schema.nodeFromJSON(n)));
  let tr = state.tr.replaceWith(0, state.doc.content.size, content);
  if (layout) tr = tr.setDocAttribute('layout', layout);
  tr = tr.setSelection(TextSelection.near(tr.doc.resolve(1)));
  view.dispatch(tr.scrollIntoView());
}

/**
 * Switches the page's layout: flow ↔ columns wraps or unwraps its content;
 * between two columns layouts, a different desktop column count reconciles
 * every section (never losing content). Returns what merged, for the notice.
 */
export function applyPageColumns(editor: Editor, next: PageColumns | null): SectionMerge[] {
  const current = editorPageColumns(editor);
  const layout = setPageColumns(layoutOf(editor), next);
  const { doc, merges, changed } = changePageColumns(editor.state.doc.toJSON() as JsonNode, current, next, 'placeholder');
  if (changed) replaceDoc(editor, doc, layout);
  else editor.view.dispatch(editor.state.tr.setDocAttribute('layout', layout));
  return merges;
}

/** After `afterPos`, else at the end; its span is the previous section's, else the page's default. */
export function insertSection(editor: Editor, afterPos: number | null = null) {
  const columns = editorPageColumns(editor);
  if (!columns) return;
  const { state, view } = editor;
  let at = state.doc.content.size;
  let width: unknown = undefined;
  if (afterPos != null) {
    const node = state.doc.nodeAt(afterPos);
    if (node) {
      at = afterPos + node.nodeSize;
      if (node.type.name === SECTION_TYPE) width = node.attrs.width ?? null;
    }
  } else {
    const last = state.doc.lastChild;
    if (last?.type.name === SECTION_TYPE) width = last.attrs.width ?? null;
  }
  const json = makeSectionNode(columns, 'placeholder', [], width !== undefined ? { width } : {});
  const node = state.schema.nodeFromJSON(json);
  const tr = state.tr.insert(at, node);
  tr.setSelection(TextSelection.near(tr.doc.resolve(at + 1)));
  tr.setMeta('keepSelected', at);
  view.dispatch(tr.scrollIntoView());
}

/** A section switched to a single column or back to the page's template, as one undo step. */
export function setSectionSingle(editor: Editor, pos: number, single: boolean) {
  const { state, view } = editor;
  const node = state.doc.nodeAt(pos);
  if (!node || node.type.name !== SECTION_TYPE) return;
  const next = setSectionColumns(node.toJSON() as JsonNode, single, editorPageColumns(editor), 'placeholder');
  const tr = state.tr.replaceWith(pos, pos + node.nodeSize, state.schema.nodeFromJSON(next));
  tr.setSelection(TextSelection.near(tr.doc.resolve(pos + 1)));
  tr.setMeta('keepSelected', pos);
  view.dispatch(tr);
}

/**
 * Each cell's blocks by id, so asking which moves a block has doesn't
 * serialize the whole document on every selection change.
 */
function sectionOutline(doc: N): JsonNode {
  const content: JsonNode[] = [];
  doc.forEach((node: N) => {
    const cells: JsonNode[] = [];
    if (node.type.name === SECTION_TYPE) {
      node.forEach((cell: N) => {
        const blocks: JsonNode[] = [];
        cell.forEach((block: N) => blocks.push({ type: block.type.name, attrs: { blockId: block.attrs?.blockId ?? null } }));
        cells.push({ type: cell.type.name, content: blocks });
      });
    }
    content.push({ type: node.type.name, content: cells });
  });
  return { type: 'doc', content };
}

/** Null when the block isn't directly in a section's cell. */
export function sectionMovesAt(editor: Editor, blockId: string): Record<SectionMove, boolean> | null {
  return sectionMovesFor(sectionOutline(editor.state.doc), blockId);
}

/**
 * Replaces only the sections involved and keeps the block selected where it
 * landed; the focus goes back to the editor from the tool that took it.
 */
export function moveBlockInSections(editor: Editor, blockId: string, move: SectionMove) {
  const { state, view } = editor;
  const edit = moveInSections(state.doc.toJSON() as JsonNode, blockId, move, 'placeholder');
  if (!edit) return;
  let from = 0;
  for (let i = 0; i < edit.from; i++) from += state.doc.child(i).nodeSize;
  let to = from;
  for (let i = edit.from; i < edit.to; i++) to += state.doc.child(i).nodeSize;
  const nodes = edit.nodes.map((n) => state.schema.nodeFromJSON(n));
  const tr = state.tr.replaceWith(from, to, Fragment.fromArray(nodes));
  const end = from + nodes.reduce((size, n) => size + n.nodeSize, 0);
  let at = -1;
  let moved: N = null;
  tr.doc.nodesBetween(from, end, (node: N, pos: number) => {
    if (at >= 0) return false;
    if (node.attrs?.blockId === blockId) {
      at = pos;
      moved = node;
      return false;
    }
    return true;
  });
  if (moved) {
    tr.setSelection(moved.type.isAtom ? NodeSelection.create(tr.doc, at) : TextSelection.near(tr.doc.resolve(at + 1), 1));
    tr.setMeta('keepSelected', at);
  }
  view.dispatch(tr.scrollIntoView());
  view.focus();
}

const strayKey = new PluginKey('pageSectionStrays');

/**
 * Keeps a columns page all sections: a top-level stray (a pasted block, the
 * placeholder a deleted last section leaves) joins one in the same undo step.
 */
export const PageSectionGuard = Extension.create({
  name: 'pageSectionGuard',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: strayKey,
        appendTransaction: (transactions, _old, state) => {
          if (!transactions.some((tr) => tr.docChanged)) return null;
          const columns = pageColumnsOf(state.doc.attrs.layout as PageLayout);
          if (!columns) return null;
          let stray = false;
          state.doc.forEach((child: N) => {
            // An unknown block stays where it is (pageSections.ts, staysTopLevel).
            if (child.type.name !== SECTION_TYPE && child.type.name !== UNKNOWN_BLOCK) stray = true;
          });
          if (!stray) return null;
          const json = normalizeStrays(state.doc.toJSON() as JsonNode, columns, 'placeholder');
          const content = Fragment.fromArray((json.content ?? []).map((n) => state.schema.nodeFromJSON(n)));
          const tr = state.tr.replaceWith(0, state.doc.content.size, content);
          return tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(state.selection.from, tr.doc.content.size))));
        },
      }),
    ];
  },
});
