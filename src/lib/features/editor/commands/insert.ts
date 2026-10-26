// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The Insert menu's commands, which only desktop chrome issues, so they stay
// out of EditorCore (docs/architecture/editor.md). The toolbar's "+" inserts near the
// caret; a placeholder's "+" replaces that node in one dispatch, one undo step.
import type { Editor } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import { makeTable, newQuickLink, type JsonNode } from '$lib/features/content';
import { nearestInsertPos, makeContainer, makeQueryTemplate, insertSection, makeFlexContainer, type InsertTarget } from '$lib/features/content/editor';

export function applyInsertTarget(editor: Editor, target: InsertTarget, content: Record<string, unknown>) {
  if (target.mode === 'insert') {
    const at = nearestInsertPos(editor, content.type as string);
    editor.chain().focus().insertContentAt(at, content).run();
    return;
  }
  const node = editor.state.doc.nodeAt(target.pos);
  if (!node) return;
  const built = editor.state.schema.nodeFromJSON(content);
  let tr = editor.state.tr.replaceWith(target.pos, target.pos + node.nodeSize, built);
  const mapped = tr.doc.resolve(Math.min(target.pos + 1, tr.doc.content.size));
  tr = tr.setSelection(TextSelection.near(mapped, 1)).setMeta('keepSelected', target.pos);
  editor.view.dispatch(tr);
  editor.view.focus();
}

/** One command per Insert-menu entry, each at the target it is given (the caret by default). */
export interface InsertCommands {
  callout: (target?: InsertTarget) => void;
  table: (target?: InsertTarget) => void;
  diagram: (target?: InsertTarget) => void;
  query: (target?: InsertTarget) => void;
  html: (target?: InsertTarget) => void;
  quickLink: (target?: InsertTarget) => void;
  grid: (target?: InsertTarget) => void;
  /** A top-level row; offered on a columns page only (`offersSection`). */
  section: (target?: InsertTarget) => void;
  offersSection: () => boolean;
  flexLayout: (target?: InsertTarget) => void;
  /** Inserts a node as given: the embedding blocks and the plugins' blocks come in through this. */
  block: (target: InsertTarget, node: JsonNode) => void;
}

export function insertCommands(
  editor: () => Editor | undefined,
  opts: {
    /** A columns page's content is sections, so its "add" adds sections. */
    columnsMode: () => boolean;
    /** A new quick-link card's id, for its retarget picker. */
    onQuickLink: (id: string) => void;
  }
): InsertCommands {
  const command = (run: (editor: Editor, target: InsertTarget) => void) => (target: InsertTarget = { mode: 'insert' }) => {
    const e = editor();
    if (e) run(e, target);
  };
  return {
    callout: command((e, target) => applyInsertTarget(e, target, { type: 'callout', attrs: { variant: 'info' }, content: [{ type: 'text', text: 'Note…' }] })),
    html: command((e, target) => applyInsertTarget(e, target, { type: 'htmlBlock', attrs: { html: '<p>Raw HTML — click "Edit HTML".</p>' } })),
    table: command((e, target) => applyInsertTarget(e, target, { ...makeTable() })),
    diagram: command((e, target) => applyInsertTarget(e, target, { type: 'diagram', attrs: { code: 'graph TD\n  A[Start] --> B[End]' } })),
    // Inserted unconfigured. Its one child, an ordinary 1×1 grid, is the
    // template, edited with the normal block tools.
    query: command((e, target) =>
      applyInsertTarget(e, target, {
        type: 'queryBlock',
        attrs: { filter: null, traversal: null, first: 20, format: 'template' },
        content: [makeQueryTemplate()]
      })
    ),
    grid: command((e, target) => applyInsertTarget(e, target, makeContainer())),
    // A top-level row, so it goes after the section the target is in, never
    // into a cell, whatever the target's mode.
    section: command((e, target) => {
      const { state } = e;
      const at = target.mode === 'replace' ? target.pos : state.selection.from;
      const resolved = state.doc.resolve(Math.min(at, state.doc.content.size));
      insertSection(e, resolved.depth >= 1 ? resolved.before(1) : null);
      e.commands.focus();
    }),
    offersSection: () => opts.columnsMode(),
    flexLayout: command((e, target) => applyInsertTarget(e, target, makeFlexContainer())),
    block: (target, node) => {
      const e = editor();
      if (e) applyInsertTarget(e, target, { ...node });
    },
    quickLink: command((e, target) => {
      const id = crypto.randomUUID();
      if (target.mode === 'insert') e.chain().focus().insertContentAt(nearestInsertPos(e, 'quickLink'), newQuickLink(id)).run();
      else applyInsertTarget(e, target, { ...newQuickLink(id) });
      opts.onQuickLink(id);
    }),
  };
}

/** The canvas's append strip: a placeholder at the end, or on a columns page a section. */
export function appendBlock(editor: Editor, columnsMode: boolean): void {
  if (columnsMode) {
    insertSection(editor);
    editor.commands.focus();
  } else {
    const end = editor.state.doc.content.size;
    editor.chain().insertContentAt(end, { type: 'placeholder' }).focus('end').run();
  }
}
