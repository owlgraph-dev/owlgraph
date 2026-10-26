// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// A mark attribute's value over the selection, plus `mixed` for a control's
// third state: editor.isActive() can't say a range spans two values.
import type { Editor } from '@tiptap/core';

export function markFieldState(editor: Editor, from: number, to: number, markName: string, attrKey: string): { value: any; mixed: boolean } {
  if (from === to) {
    // A caret reads the stored marks, which apply to the next typed text.
    const attrs = editor.getAttributes(markName);
    return { value: attrs?.[attrKey] ?? null, mixed: false };
  }
  let sawAny = false;
  let value: any = null;
  let mixed = false;
  editor.state.doc.nodesBetween(from, to, (node) => {
    if (!node.isText) return;
    const mark = node.marks.find((m: any) => m.type.name === markName);
    const v = mark ? (mark.attrs?.[attrKey] ?? null) : null;
    if (!sawAny) {
      value = v;
      sawAny = true;
    } else if (v !== value) {
      mixed = true;
    }
  });
  return { value: mixed ? null : value, mixed };
}
