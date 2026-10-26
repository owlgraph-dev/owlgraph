// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The desktop editor's keyboard and focus beside its layers. Everything here
// runs synchronously inside the event it handles: an await before a focus
// move would let Bits UI's own focus handling run first.
import type { EditorCore } from '../core/editorCore.svelte';

/**
 * The window's Escape steps the selection up to the parent block. Bits UI's
 * EscapeLayer never stops propagation, so the Escape that closes a panel
 * still reaches the window; editor.isFocused is unreliable then, and
 * ProseMirror preventDefault()s every Escape, so only `overlayOpen` tells.
 */
export function escapeStepsUp(e: KeyboardEvent, core: EditorCore, overlayOpen: boolean): void {
  if (e.key !== 'Escape' || overlayOpen || !core.editor?.isFocused || core.selection.index <= 0) return;
  e.preventDefault();
  core.selection.selectAncestor(core.selection.index - 1);
}

/**
 * For panels whose action refocuses the editor: Bits UI's close-auto-focus
 * would move focus back to the trigger. It runs after the click handler, so
 * focus already in the editor means an action closed the panel.
 */
export function preserveEditorFocusOnClose(event: Event): void {
  if (document.activeElement?.closest('.ProseMirror')) event.preventDefault();
}

/**
 * Escape in the link picker returns the caret to the text, not the Link
 * button. The range is kept from the Escape on, since closing clears it.
 */
export function linkPickerFocus(core: EditorCore): { escape: () => void; closeAutoFocus: (event: Event) => void } {
  let escaped: { range: { from: number; to: number } | null } | null = null;
  return {
    escape: () => {
      escaped = { range: core.links.range };
    },
    closeAutoFocus: (event) => {
      const was = escaped;
      escaped = null;
      if (!was || !core.editor) {
        preserveEditorFocusOnClose(event);
        return;
      }
      event.preventDefault();
      const chain = core.editor.chain().focus();
      (was.range ? chain.setTextSelection(was.range) : chain).run();
    },
  };
}
