// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The selection chain and what is selected in it: the block, the cell,
// container, list and table cell around the caret, the typography target, and
// the guards the block tools ask. The core refreshes it after every
// transaction. Public methods are arrow fields, as the core's are.
import type { Editor } from '@tiptap/core';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';
import { canRemoveLastTableColumn, canRemoveLastTableRow } from '$lib/features/content/editor';
import { resolveSelectionChain, isPageEntry, type SelectionChainEntry } from '$lib/features/content/editor';
import { canRemoveLastContainerColumn, canRemoveLastContainerRow } from '$lib/features/content/editor';
import { canRemoveLastCell } from '$lib/features/content/editor';

/** A node around the selection, and where it is. */
export type SelectionContext = { type: string; attrs: Record<string, any>; pos: number };
export type SelectedBlock = { id: string; type: string; attrs: Record<string, any> };

export class SelectionState {
  // The ancestor chain (root -> leaf) at the selection and a pointer into it,
  // pinned to an ancestor by selectAncestor(). Everything selected reads off
  // this chain, so nothing can disagree.
  chain: SelectionChainEntry[] = $state([]);
  index = $state(-1);
  // A new object after every refresh, the same block or not: what reads the
  // document beside it (the section moves) recomputes on it.
  selected = $state<SelectedBlock | null>(null);
  // The ancestor pin survives refreshes that don't move the PM selection (a
  // block settings edit); released once the selection's position changes.
  #pendingSelectIndex: number | null = null;
  #pinnedSelectionPos: number | null = null;

  containerGuards = $state<{ canRemoveCol: boolean; canRemoveRow: boolean } | null>(null);
  tableGuards = $state<{ canRemoveCol: boolean; canRemoveRow: boolean } | null>(null);
  flexGuards = $state<{ canRemoveCell: boolean } | null>(null);

  // The cell, container, list and table cell the cursor is in.
  cell = $state<SelectionContext | null>(null);
  container = $state<SelectionContext | null>(null);
  list = $state<SelectionContext | null>(null);
  tableCell = $state<SelectionContext | null>(null);

  // The selected chain entry (a block, or an id-less cell reached by
  // select-parent), not the nearest capable ancestor: what typography edits.
  textTarget = $state<SelectionContext | null>(null);

  #editor: () => Editor | undefined;
  #refresh: () => void;

  /** `refresh` is the core's, which refreshes this and the rest. */
  constructor(editor: () => Editor | undefined, refresh: () => void) {
    this.#editor = editor;
    this.#refresh = refresh;
  }

  /**
   * Reads the chain at the editor's selection. `keepPos`, a transaction's
   * 'keepSelected' meta, names the position to re-pin: a full-range
   * replaceWith leaves the selection unpredictable. Returns the text target's
   * entry, so the core need not read this state back inside a refresh.
   */
  refresh = (editor: Editor, keepPos: number | null): SelectionChainEntry | null => {
    const chain = resolveSelectionChain(editor);
    this.chain = chain;
    if (keepPos != null) {
      const idx = chain.findIndex((e) => e.pos === keepPos);
      if (idx >= 0) {
        this.#pendingSelectIndex = idx;
        this.#pinnedSelectionPos = editor.state.selection.from;
      }
    } else if (this.#pendingSelectIndex !== null && editor.state.selection.from !== this.#pinnedSelectionPos) {
      this.#pendingSelectIndex = null;
    }
    this.index = this.#pendingSelectIndex !== null && this.#pendingSelectIndex < chain.length ? this.#pendingSelectIndex : chain.length - 1;
    const activeEntry = chain[this.index] ?? null;
    this.selected = activeEntry?.id ? { id: activeEntry.id, type: activeEntry.type, attrs: activeEntry.attrs } : null;
    // Unlike `selected`, id-less cells count. The page doesn't: it has no
    // position, and page-wide type is the site's typography settings.
    const typoEntry = activeEntry && !isPageEntry(activeEntry) ? activeEntry : null;
    this.textTarget = typoEntry ? { type: typoEntry.type, attrs: typoEntry.attrs, pos: typoEntry.pos } : null;

    this.containerGuards =
      activeEntry?.type === 'grid'
        ? (() => {
            const liveNode = editor.state.doc.nodeAt(activeEntry.pos);
            return liveNode ? { canRemoveCol: canRemoveLastContainerColumn(liveNode), canRemoveRow: canRemoveLastContainerRow(liveNode) } : null;
          })()
        : null;
    this.tableGuards =
      activeEntry?.type === 'table'
        ? (() => {
            const liveNode = editor.state.doc.nodeAt(activeEntry.pos);
            return liveNode ? { canRemoveCol: canRemoveLastTableColumn(liveNode), canRemoveRow: canRemoveLastTableRow(liveNode) } : null;
          })()
        : null;
    this.flexGuards =
      activeEntry?.type === 'flexContainer'
        ? (() => {
            const liveNode = editor.state.doc.nodeAt(activeEntry.pos);
            return liveNode ? { canRemoveCell: canRemoveLastCell(liveNode) } : null;
          })()
        : null;

    // Scanned leaf-first, as lists and cells nest, and bounded by the next
    // container after the selected entry so a nested layout's cells don't
    // leak into the outer selection's context.
    const containerIdxs = chain.reduce<number[]>(
      (acc, e, i) => (e.type === 'grid' || e.type === 'flexContainer' || e.type === 'pageSection' ? [...acc, i] : acc),
      []
    );
    const compartmentEnd = containerIdxs.find((i) => i > this.index) ?? chain.length;
    const findInner = (pred: (e: SelectionChainEntry) => boolean) => {
      for (let i = compartmentEnd - 1; i >= 0; i--) if (pred(chain[i])) return chain[i];
      return null;
    };
    const cn = findInner((e) => e.type === 'gridCell' || e.type === 'flexCell');
    const ktn = findInner((e) => e.type === 'grid' || e.type === 'flexContainer');
    const ln = findInner((e) => e.type === 'bulletList' || e.type === 'orderedList');
    const tcn = findInner((e) => e.type === 'tableCell');
    this.cell = cn ? { type: cn.type, attrs: { ...cn.attrs }, pos: cn.pos } : null;
    this.container = ktn ? { type: ktn.type, attrs: { ...ktn.attrs }, pos: ktn.pos } : null;
    this.list = ln ? { type: ln.type, attrs: { ...ln.attrs }, pos: ln.pos } : null;
    this.tableCell = tcn ? { type: tcn.type, attrs: { ...tcn.attrs }, pos: tcn.pos } : null;
    return typoEntry;
  };

  // Pins the index until the selection moves away (see refresh).
  selectAncestor = (i: number) => {
    const editor = this.#editor();
    if (!editor) return;
    const entry = this.chain[i];
    if (!entry) return;
    // The page has no position: the caret stays and only the pointer moves.
    if (isPageEntry(entry)) {
      this.#pendingSelectIndex = i;
      this.#pinnedSelectionPos = editor.state.selection.from;
      this.#refresh();
      return;
    }
    const { state, view } = editor;
    const nodeType = state.schema.nodes[entry.type];
    let tr = state.tr;
    if (nodeType?.isAtom) {
      tr = tr.setSelection(NodeSelection.create(tr.doc, entry.pos));
    } else {
      const insidePos = tr.doc.resolve(Math.min(entry.pos + 1, tr.doc.content.size));
      tr = tr.setSelection(TextSelection.near(insidePos, 1));
    }
    this.#pendingSelectIndex = i;
    this.#pinnedSelectionPos = tr.selection.from;
    view.dispatch(tr);
    view.focus();
    // A container whose first position is the caret's fires no update.
    this.#refresh();
  };

  // For a finding listed outside the canvas (the colour scheme dialog).
  selectBlockById = (blockId: string): boolean => {
    const editor = this.#editor();
    if (!editor) return false;
    const { state, view } = editor;
    let target: { pos: number; atom: boolean } | null = null;
    state.doc.descendants((node, pos) => {
      if (target) return false;
      if (node.attrs?.blockId === blockId) {
        target = { pos, atom: node.isAtom };
        return false;
      }
      return true;
    });
    const found = target as { pos: number; atom: boolean } | null;
    if (!found) return false;
    const selection = found.atom
      ? NodeSelection.create(state.doc, found.pos)
      : TextSelection.near(state.doc.resolve(Math.min(found.pos + 1, state.doc.content.size)), 1);
    view.dispatch(state.tr.setSelection(selection).scrollIntoView());
    view.focus();
    return true;
  };
}
