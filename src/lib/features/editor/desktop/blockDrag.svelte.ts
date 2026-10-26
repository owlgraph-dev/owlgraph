// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// A block's drag-and-drop by its grip. Pointer-based, so each drop is
// validated against the schema, which keeps containers out of cells. Public
// methods are arrow fields, as the window's listeners need one identity.
import { canDropRelative, moveBlockRelative } from '$lib/features/content/editor';
import type { EditorCore } from '../core/editorCore.svelte';
import type { BlockHover } from './hover.svelte';

export class BlockDrag {
  dragging = $state(false);
  dropValid = $state(false);
  dropLine = $state<{ top: number; left: number; width: number } | null>(null);
  #dragId: string | null = null;
  #dragEl: HTMLElement | null = null;
  #dropRef: { id: string; place: 'before' | 'after' } | null = null;
  #core: EditorCore;
  #shell: () => HTMLElement | null;
  #hover: BlockHover;

  constructor(core: EditorCore, shell: () => HTMLElement | null, hover: BlockHover) {
    this.#core = core;
    this.#shell = shell;
    this.#hover = hover;
  }

  start = (id: string, e: PointerEvent) => {
    const editor = this.#core.editor;
    if (!editor) return;
    e.preventDefault();
    this.#dragId = id;
    this.dragging = true;
    this.#dragEl = (editor.view.dom as HTMLElement).querySelector(`[data-block-id="${this.#dragId}"]`);
    this.#dragEl?.classList.add('block-dragging');
    document.body.style.userSelect = 'none';
    this.#hover.clear();
    window.addEventListener('pointermove', this.#move);
    window.addEventListener('pointerup', this.#end, { once: true });
  };

  /** The window's listener a drag leaves behind, removed as the shell goes. */
  destroy = () => {
    window.removeEventListener('pointermove', this.#move);
  };

  #move = (e: PointerEvent) => {
    const editor = this.#core.editor;
    const shell = this.#shell();
    if (!this.dragging || !editor || !shell) return;
    const raw = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    let el = raw?.closest('[data-block-id]') as HTMLElement | null;
    // Over a cell's empty area the nearest id is the container's (a cell has
    // none), which would drop outside it; aim after the cell's last block.
    let forced: 'after' | null = null;
    const cellEl = raw?.closest('.grid-cell, .flex-cell') as HTMLElement | null;
    if (el && cellEl && el.contains(cellEl)) {
      const last = [...cellEl.children].reverse().find((c) => (c as HTMLElement).dataset?.blockId) as HTMLElement | undefined;
      if (last) {
        el = last;
        forced = 'after';
      }
    }
    if (!el || !shell.contains(el) || el.dataset.blockId === this.#dragId) {
      this.#dropRef = null;
      this.dropLine = null;
      this.dropValid = false;
      return;
    }
    const id = el.dataset.blockId!;
    const r = el.getBoundingClientRect();
    const place: 'before' | 'after' = forced ?? (e.clientY < r.top + r.height / 2 ? 'before' : 'after');
    this.dropValid = canDropRelative(editor, this.#dragId!, id, place);
    this.#dropRef = { id, place };
    const shellRect = shell.getBoundingClientRect();
    this.dropLine = {
      top: (place === 'before' ? r.top : r.bottom) - shellRect.top,
      left: r.left - shellRect.left,
      width: r.width,
    };
  };

  #end = () => {
    window.removeEventListener('pointermove', this.#move);
    const editor = this.#core.editor;
    if (this.dragging && editor && this.#dragId && this.#dropRef && this.dropValid) {
      moveBlockRelative(editor, this.#dragId, this.#dropRef.id, this.#dropRef.place);
    }
    this.#dragEl?.classList.remove('block-dragging');
    document.body.style.userSelect = '';
    this.dragging = false;
    this.#dragId = null;
    this.#dragEl = null;
    this.#dropRef = null;
    this.dropLine = null;
    this.dropValid = false;
    this.#hover.clear();
  };
}
