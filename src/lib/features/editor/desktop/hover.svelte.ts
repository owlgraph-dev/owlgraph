// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The hover outline and grip over the block under the mouse, hidden while the
// author clicks or types until the pointer leaves that block. Public methods
// are arrow fields: the shell hands them to the DOM as listeners.
import { blockNodeById, currentBlock } from '$lib/features/content/editor';
import type { EditorCore } from '../core/editorCore.svelte';
import { extendListItemBox, type Box } from '../shared/selectedBox.svelte';

export class BlockHover {
  id = $state<string | null>(null);
  box = $state<Box | null>(null);
  // Suppresses the hover overlay while the user clicks or types.
  interacting = $state(false);
  /** The block the caret was in at the last edit. */
  caretBlockId: string | null = null;
  #core: EditorCore;
  #shell: () => HTMLElement | null;
  #dragging: () => boolean;

  constructor(core: EditorCore, shell: () => HTMLElement | null, dragging: () => boolean) {
    this.#core = core;
    this.#shell = shell;
    this.#dragging = dragging;
  }

  /** The core's activity callback: hides the overlay while editing. */
  onActivity = () => {
    this.interacting = true;
    this.caretBlockId = this.#core.editor ? (currentBlock(this.#core.editor)?.id ?? null) : null;
  };

  move = (e: PointerEvent) => {
    // A tap's compatibility events would raise the hover tools under the
    // finger, where they take the tap meant for the text.
    if (e.pointerType === 'touch') return;
    const editor = this.#core.editor;
    const shell = this.#shell();
    if (!editor || !shell || this.#dragging()) return;
    const raw = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    // Over the overlay's own buttons: keep the current target.
    if (raw?.closest('.block-tools')) return;
    const el = raw?.closest('[data-block-id]') as HTMLElement | null;
    if (!el || !shell.contains(el)) {
      if (!this.interacting) this.clear();
      return;
    }
    const id = el.dataset.blockId ?? null;
    const type = id ? (blockNodeById(editor, id)?.type?.name ?? null) : null;
    // Containers and tables are reached by selection, not hover: hovering their
    // gaps would flicker the ring between them and the child last crossed.
    if (type === 'grid' || type === 'pageSection' || type === 'flexContainer' || type === 'table') return;
    // While editing, keep the overlay hidden until the cursor leaves the block.
    if (this.interacting && id === this.caretBlockId) return;
    this.interacting = false;
    const shellRect = shell.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const { left, width } = extendListItemBox(type ?? '', el, r, shellRect);
    this.id = id;
    this.box = { top: r.top - shellRect.top, left, width, height: r.height };
  };

  leave = () => {
    this.clear();
  };

  clear = () => {
    this.box = null;
    this.id = null;
  };
}
