// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// For a picker that inserts a snippet at its text field's caret. Returns the
// new value rather than assigning it, so the caller keeps its own `$state`.

export interface CaretInsert {
  value: string;
  /** After the inserted text. */
  caret: number;
}

/** `field` is null when the picker is used before the field mounts: the snippet is appended. */
export function insertAtCaret(field: HTMLTextAreaElement | HTMLInputElement | null, value: string, snippet: string): CaretInsert {
  if (!field) return { value: value + snippet, caret: value.length + snippet.length };
  const { selectionStart, selectionEnd } = field;
  const start = selectionStart ?? value.length;
  const end = selectionEnd ?? start;
  return { value: `${value.slice(0, start)}${snippet}${value.slice(end)}`, caret: start + snippet.length };
}

/** Focus the field and place the caret, after the new value has rendered. */
export function restoreCaret(field: HTMLTextAreaElement | HTMLInputElement | null, caret: number): void {
  if (!field) return;
  queueMicrotask(() => {
    field.focus();
    field.setSelectionRange(caret, caret);
  });
}
