// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// What the editor-only handles of the grid, the table and the image share.
import type { Attachment } from 'svelte/attachments';

interface Editing {
  getPos(): number | undefined;
  editor: { state: { doc: { nodeAt(pos: number): unknown } } };
}

/** The block's node in the editor's document now, or null once it is gone. */
export function liveNodeOf(editing: Editing): any {
  const pos = editing.getPos();
  return typeof pos === 'number' ? editing.editor.state.doc.nodeAt(pos) : null;
}

/**
 * `run` a frame later, for a measurement an edit lands before: its cells, or
 * its rule in the editor's live sheet a microtask after. `cancel` drops what
 * is still pending.
 */
export function frameScheduler(run: () => void): { schedule: () => void; cancel: () => void } {
  const frames = new Set<number>();
  return {
    schedule() {
      const id = requestAnimationFrame(() => {
        frames.delete(id);
        run();
      });
      frames.add(id);
    },
    cancel() {
      for (const id of frames) cancelAnimationFrame(id);
      frames.clear();
    },
  };
}

// mousedown is swallowed so ProseMirror never starts a text selection here.
export const pointerHandle =
  (start: (e: PointerEvent, index: number) => void, index: number): Attachment<HTMLElement> =>
  (node) => {
    const swallow = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };
    const down = (e: PointerEvent) => start(e, index);
    node.addEventListener('mousedown', swallow);
    node.addEventListener('pointerdown', down);
    return () => {
      node.removeEventListener('mousedown', swallow);
      node.removeEventListener('pointerdown', down);
    };
  };
