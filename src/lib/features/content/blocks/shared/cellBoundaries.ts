// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// A text selection stays in the cell it started in (docs/architecture/blocks/layout.md, "Cell
// boundaries"). `isolating` only stops commands like joinBackward; replacing a
// selection that spans two cells would join them, so every text selection is
// clamped to the anchor's cell; one covering a container whole is left alone.
// Select-all takes two presses for the same reason.
import { Extension } from '@tiptap/core';
import type { Node as PMNode, ResolvedPos } from '@tiptap/pm/model';
import { AllSelection, Plugin, PluginKey, Selection, TextSelection, type EditorState } from '@tiptap/pm/state';

/** The depth of the innermost isolating node around a position, 0 for the document. */
function cellDepth($pos: ResolvedPos): number {
  for (let d = $pos.depth; d > 0; d--) if ($pos.node(d).type.spec.isolating) return d;
  return 0;
}

/** One step toward the anchor's cell: where the head goes next, or null when it is in that cell. */
function clampStep(doc: PMNode, anchor: number, head: number): number | null {
  const $anchor = doc.resolve(anchor);
  const $head = doc.resolve(head);
  const depth = cellDepth($anchor);
  const start = depth === 0 ? 0 : $anchor.start(depth);
  const end = depth === 0 ? doc.content.size : $anchor.end(depth);
  const forward = head > anchor;
  let edge: number;
  if (head < start || head > end) {
    // Left the anchor's cell: its edge on the way out.
    edge = forward ? end : start;
  } else {
    // In the anchor's cell — but inside a container in it, entered from outside?
    let entered = -1;
    for (let d = depth + 1; d <= $head.depth; d++) {
      if ($head.node(d).type.spec.isolating) {
        entered = d;
        break;
      }
    }
    if (entered < 0) return null;
    edge = forward ? $head.before(entered) : $head.after(entered);
  }
  // The nearest text position from the edge back toward the anchor. It may
  // lie in yet another container (one that ends the cell); the next step
  // moves it out of that one too.
  const found = Selection.findFrom(doc.resolve(edge), forward ? -1 : 1, true);
  return found ? found.head : anchor;
}

/** The selection with its head kept in the anchor's cell, or null when it already is. */
export function clampToCell(doc: PMNode, selection: Selection): TextSelection | null {
  if (!(selection instanceof TextSelection) || selection.empty) return null;
  const { anchor } = selection;
  let head = selection.head;
  // Each step leaves one container; nesting is shallow, the bound is a guard.
  for (let i = 0; i < 16; i++) {
    const next = clampStep(doc, anchor, head);
    if (next == null || next === head) break;
    head = next;
  }
  return head === selection.head ? null : TextSelection.create(doc, anchor, head);
}

/**
 * What select-all selects next: the text block the selection lies in, while
 * it doesn't cover that block yet; otherwise the page.
 */
export function selectAllStep(state: EditorState): Selection {
  const { selection } = state;
  const { $from, $to } = selection;
  if (selection instanceof TextSelection && $from.sameParent($to) && $from.parent.isTextblock) {
    const start = $from.start();
    const end = $from.end();
    if (selection.from > start || selection.to < end) return TextSelection.create(state.doc, start, end);
  }
  return new AllSelection(state.doc);
}

export const CellBoundaries = Extension.create({
  name: 'cellBoundaries',
  // Ahead of Tiptap's core keymap (100), whose Mod-a selects the whole document at once.
  priority: 101,

  addKeyboardShortcuts() {
    return {
      'Mod-a': ({ editor }) => {
        editor.view.dispatch(editor.state.tr.setSelection(selectAllStep(editor.state)));
        return true;
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('cellBoundaries'),
        appendTransaction(transactions, _oldState, state) {
          if (!transactions.some((tr) => tr.selectionSet || tr.docChanged)) return null;
          const clamped = clampToCell(state.doc, state.selection);
          return clamped ? state.tr.setSelection(clamped) : null;
        },
      }),
    ];
  },
});
