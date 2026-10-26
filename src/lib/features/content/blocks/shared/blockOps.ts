// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Block operations addressed by `blockId` at any depth: the same id the overlay
// and block settings panel use (ensureBlockIds backfills it on save).
import type { Editor } from '@tiptap/core';
import { closeHistory } from '@tiptap/pm/history';
import { Fragment } from '@tiptap/pm/model';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';
import { blockSupportsCapability } from '../../capabilities/detect';

type N = any;

// `pos` is the position immediately before the node.
function findById(editor: Editor, id: string): { node: N; pos: number } | null {
  let res: { node: N; pos: number } | null = null;
  editor.state.doc.descendants((node: N, pos: number) => {
    if (res) return false;
    if (node.attrs?.blockId === id) {
      res = { node, pos };
      return false;
    }
    return true;
  });
  return res;
}

export function blockNodeById(editor: Editor, id: string): N | null {
  return findById(editor, id)?.node ?? null;
}

// The first ancestor level that accepts the type as a direct child. Plain
// insertContent() lets ProseMirror split ancestors until one fits, which in a
// table cell splits the cell, the row and the table itself.
export function nearestInsertPos(editor: Editor, typeName: string): number {
  const nodeType = editor.schema.nodes[typeName];
  const { doc } = editor.state;
  const { $from } = editor.state.selection;
  for (let d = $from.depth; d >= 0; d--) {
    const pos = d === $from.depth ? $from.pos : $from.after(d + 1);
    const $pos = doc.resolve(pos);
    if ($pos.parent.canReplaceWith($pos.index(), $pos.index(), nodeType)) {
      return pos;
    }
  }
  return doc.content.size;
}

// Id-less node types the selection chain still surfaces, so the breadcrumb
// can show "grid › cell › paragraph".
const CONTEXT_CHAIN_TYPES = new Set(['gridCell', 'flexCell', 'tableCell']);

// Construction blocks, out of scope for the phone editor (docs/architecture/editor.md).
// The set gates container-editing chrome only; content inside stays editable.
export { STRUCTURAL_BLOCK_TYPES } from '../catalog';

// The toolbar's "+" inserts near the cursor; a placeholder's "+" replaces the
// placeholder (applyInsertTarget, editor/commands/insert.ts).
export type InsertTarget = { mode: 'insert' } | { mode: 'replace'; pos: number };

export type SelectionChainEntry = {
  type: string;
  id: string | null;
  attrs: Record<string, unknown>;
  pos: number;
};

/** The chain root's pseudo-type: the page is the doc node, which has no type name to switch on. */
export const PAGE_TYPE = 'page';
/** The root entry's `pos`: no position, so nothing selects it or reads a node at it. */
export const PAGE_POS = -1;

export function isPageEntry(entry: { type: string } | null | undefined): boolean {
  return entry?.type === PAGE_TYPE;
}

// The one walk of the selection's ancestry (root → leaf): the selected block,
// the style contexts and the breadcrumb all project from it, so they agree.
export function resolveSelectionChain(editor: Editor): SelectionChainEntry[] {
  // The page is always index 0: the outermost flow, a selection target with
  // settings of its own. It has no position, so selectAncestor() must not place
  // a selection there, and its attrs are written with setDocAttribute.
  const chain: SelectionChainEntry[] = [
    { type: PAGE_TYPE, id: null, attrs: { ...editor.state.doc.attrs }, pos: PAGE_POS },
  ];
  const $from = editor.state.selection.$from;
  for (let d = 1; d <= $from.depth; d++) {
    const node = $from.node(d);
    const id = (node?.attrs?.blockId as string | undefined) ?? null;
    if (!id && !CONTEXT_CHAIN_TYPES.has(node.type.name)) continue;
    chain.push({
      type: node.type.name,
      id,
      attrs: { ...node.attrs },
      pos: $from.before(d),
    });
  }
  const sel = editor.state.selection as N;
  if (sel?.node?.attrs?.blockId && sel.node.attrs.blockId !== chain.at(-1)?.id) {
    chain.push({
      type: sel.node.type.name,
      id: sel.node.attrs.blockId,
      attrs: { ...sel.node.attrs },
      pos: sel.from,
    });
  }
  return chain;
}

// Also finds an atom block selected as a NodeSelection.
export function currentBlock(
  editor: Editor
): { id: string; type: string; attrs: Record<string, unknown> } | null {
  const chain = resolveSelectionChain(editor);
  for (let i = chain.length - 1; i >= 0; i--) {
    const entry = chain[i];
    if (entry.id) return { id: entry.id, type: entry.type, attrs: entry.attrs };
  }
  return null;
}

export function setBlockAttrsById(editor: Editor, id: string, attrs: Record<string, unknown>) {
  const f = findById(editor, id);
  if (!f) return;
  const { state, view } = editor;
  view.dispatch(state.tr.setNodeMarkup(f.pos, undefined, { ...f.node.attrs, ...attrs }));
}

export function deleteBlockById(editor: Editor, id: string) {
  const f = findById(editor, id);
  if (!f) return;
  const { state, view } = editor;
  const $pos = state.doc.resolve(f.pos);
  const parent = $pos.parent;
  const parentIsList = parent.type.name === 'bulletList' || parent.type.name === 'orderedList';

  // A list can be neither empty nor hold a paragraph, so its last item takes
  // the list with it; an emptied container gets a placeholder.
  if (parentIsList && parent.childCount === 1) {
    const listPos = $pos.before($pos.depth);
    const list = state.doc.nodeAt(listPos);
    if (!list) return;
    const $list = state.doc.resolve(listPos);
    if ($list.parent.childCount === 1) {
      const p = state.schema.nodes.placeholder.create();
      view.dispatch(state.tr.replaceWith(listPos, listPos + list.nodeSize, p));
    } else {
      view.dispatch(state.tr.delete(listPos, listPos + list.nodeSize));
    }
    view.focus();
    return;
  }

  // Cells and the doc require `block+`.
  if (parent.childCount === 1) {
    const p = state.schema.nodes.placeholder.create();
    view.dispatch(state.tr.replaceWith(f.pos, f.pos + f.node.nodeSize, p));
  } else {
    view.dispatch(state.tr.delete(f.pos, f.pos + f.node.nodeSize));
  }
  view.focus();
}

// A full-range replaceWith loses the selection's mapping, so the moved node is
// re-selected and tagged 'keepSelected': the editor core then re-pins to the
// chain entry at that position, which for a container isn't the caret's.
export function moveBlockById(editor: Editor, id: string, dir: -1 | 1) {
  const f = findById(editor, id);
  if (!f) return;
  const { state, view } = editor;
  const $pos = state.doc.resolve(f.pos);
  const parent = $pos.parent;
  const index = $pos.index();
  const j = index + dir;
  if (j < 0 || j >= parent.childCount) return;
  const children: N[] = [];
  parent.forEach((c: N) => children.push(c));
  [children[index], children[j]] = [children[j], children[index]];
  const start = $pos.start();
  let tr = state.tr.replaceWith(start, $pos.end(), Fragment.fromArray(children));
  let newPos = start;
  for (let k = 0; k < j; k++) newPos += children[k].nodeSize;
  const movedType = children[j].type;
  tr = movedType.isAtom
    ? tr.setSelection(NodeSelection.create(tr.doc, newPos))
    : tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(newPos + 1, tr.doc.content.size)), 1));
  tr.setMeta('keepSelected', newPos);
  view.dispatch(tr);
  view.focus();
}

/** The capabilities a block keeps when it becomes a block of another kind (replaceBlockKind). */
export const CARRIED_CAPABILITIES = ['spacing', 'surface', 'typography', 'placement'] as const;
export type CarriedCapability = (typeof CARRIED_CAPABILITIES)[number];

// One undo step (docs/architecture/blocks/node-embeds.md, "One family in the editor"). The block keeps
// its blockId and the capabilities the new kind takes, from `carry` where the
// old kind stores one in another shape. No other attr carries: two kinds may
// give one name different meanings.
export function replaceBlockKind(
  editor: Editor,
  id: string,
  to: { type: string; attrs: Record<string, unknown>; carry?: Partial<Record<CarriedCapability, unknown>> }
): boolean {
  const f = findById(editor, id);
  const type = editor.schema.nodes[to.type];
  if (!f || !type) return false;
  const attrs: Record<string, unknown> = { blockId: id };
  // Tiptap writes the global attrs (spacing) into the spec too.
  const declared = type.spec.attrs ?? {};
  for (const capability of CARRIED_CAPABILITIES) {
    if (!(capability in declared)) continue;
    if (capability !== 'spacing' && !blockSupportsCapability(editor, to.type, capability)) continue;
    const value = to.carry && capability in to.carry ? to.carry[capability] : f.node.attrs[capability];
    if (value != null) attrs[capability] = value;
  }
  const node = type.create({ ...attrs, ...to.attrs });
  const { state, view } = editor;
  const tr = closeHistory(state.tr).replaceWith(f.pos, f.pos + f.node.nodeSize, node);
  tr.setSelection(NodeSelection.create(tr.doc, f.pos));
  tr.setMeta('keepSelected', f.pos);
  view.dispatch(tr);
  return true;
}

// Drag-and-drop moves, across parents; the schema decides what may land where.

function dropInsertPos(src: { node: N; pos: number }, ref: { node: N; pos: number }, place: 'before' | 'after'): number {
  return place === 'before' ? ref.pos : ref.pos + ref.node.nodeSize;
}

// Gates the drop and colours the drop indicator.
export function canDropRelative(editor: Editor, sourceId: string, refId: string, place: 'before' | 'after'): boolean {
  if (sourceId === refId) return false;
  const src = findById(editor, sourceId);
  const ref = findById(editor, refId);
  if (!src || !ref) return false;
  const insertPos = dropInsertPos(src, ref, place);
  if (insertPos >= src.pos && insertPos <= src.pos + src.node.nodeSize) return false;
  const $ins = editor.state.doc.resolve(insertPos);
  return $ins.parent.canReplaceWith($ins.index(), $ins.index(), src.node.type);
}

export function moveBlockRelative(editor: Editor, sourceId: string, refId: string, place: 'before' | 'after') {
  if (!canDropRelative(editor, sourceId, refId, place)) return;
  const src = findById(editor, sourceId);
  const ref = findById(editor, refId);
  if (!src || !ref) return;
  const { state, view } = editor;
  const insertPos = dropInsertPos(src, ref, place);
  const $src = state.doc.resolve(src.pos);
  const parent = $src.parent;
  const parentIsList = parent.type.name === 'bulletList' || parent.type.name === 'orderedList';
  const onlyChild = parent.childCount === 1;

  // A moved only child leaves a placeholder, except in a list, which can't
  // hold one: the list goes too.
  let delFrom = src.pos;
  let delTo = src.pos + src.node.nodeSize;
  let filler: N = null;
  if (onlyChild && parentIsList) {
    const listPos = $src.before($src.depth);
    const list = state.doc.nodeAt(listPos);
    if (list) {
      delFrom = listPos;
      delTo = listPos + list.nodeSize;
      if (state.doc.resolve(listPos).parent.childCount === 1) {
        filler = state.schema.nodes.placeholder.create();
      }
    }
  } else if (onlyChild) {
    filler = state.schema.nodes.placeholder.create();
  }

  // One step: after a plain delete ProseMirror would fill the emptied parent
  // with a paragraph of its own beside the placeholder.
  let tr = filler ? state.tr.replaceWith(delFrom, delTo, filler) : state.tr.delete(delFrom, delTo);
  const at = tr.mapping.map(insertPos);
  tr = tr.insert(at, src.node);
  // The target may have held only a placeholder (an empty cell).
  const $at = tr.doc.resolve(at);
  const drop: number[] = [];
  $at.parent.forEach((child: N, offset: number) => {
    if (child.type.name === 'placeholder') drop.push($at.start() + offset);
  });
  for (const pos of drop.reverse()) tr = tr.delete(pos, pos + tr.doc.nodeAt(pos)!.nodeSize);
  view.dispatch(tr);
  view.focus();
}
