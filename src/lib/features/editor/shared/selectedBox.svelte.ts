// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The selected block's box over the canvas, which its outline and tools are
// drawn in. Construct during a shell's init: it registers two effects.
import type { EditorCore } from '../core/editorCore.svelte';

export type Box = { top: number; left: number; width: number; height: number };

/**
 * A list item's box starts at its text; extended left to the list's edge so
 * the marker in the gutter is part of it.
 */
export function extendListItemBox(type: string, el: HTMLElement, r: DOMRect, shellRect: DOMRect): { left: number; width: number } {
  let left = r.left - shellRect.left;
  let width = r.width;
  if (type === 'listItem') {
    const list = el.closest('ul, ol') as HTMLElement | null;
    if (list) {
      const listLeft = list.getBoundingClientRect().left - shellRect.left;
      width = left + width - listLeft;
      left = listLeft;
    }
  }
  return { left, width };
}

export class SelectedBox {
  box = $state<Box | null>(null);
  #core: EditorCore;
  #shell: () => HTMLElement | null;
  #extendListItems: boolean;

  constructor(core: EditorCore, shell: () => HTMLElement | null, opts: { extendListItems: boolean }) {
    this.#core = core;
    this.#shell = shell;
    this.#extendListItems = opts.extendListItems;
    // An effect of its own, not a call in the core's refresh(): that runs nested in
    // other effects (lockLost's setEditable fires 'update'), where measuring and
    // writing the box looped into effect_update_depth_exceeded.
    $effect(() => {
      this.#measure();
    });
    // The shell's box changes without the selection (resize, viewport preview,
    // the block settings panel); a window 'resize' misses the preview toggle.
    $effect(() => {
      const el = this.#shell();
      if (!el) return;
      const ro = new ResizeObserver(() => this.#measure());
      ro.observe(el);
      return () => ro.disconnect();
    });
  }

  #measure() {
    const core = this.#core;
    const shell = this.#shell();
    if (!core.editor || !shell) { this.box = null; return; }
    const entry = core.selection.chain[core.selection.index];
    if (!entry) { this.box = null; return; }
    const el: HTMLElement | null = entry.id
      ? (shell.querySelector(`[data-block-id="${entry.id}"]`) as HTMLElement | null)
      : (core.editor.view.nodeDOM(entry.pos) as HTMLElement | null);
    if (!el) { this.box = null; return; }
    const shellRect = shell.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (this.#extendListItems) {
      const { left, width } = extendListItemBox(entry.type, el, r, shellRect);
      this.box = { top: r.top - shellRect.top, left, width, height: r.height };
    } else {
      this.box = { top: r.top - shellRect.top, left: r.left - shellRect.left, width: r.width, height: r.height };
    }
  }
}
