// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// A block section's modified dot. Defaults come from the registered node
// spec, so there is no second table of defaults to keep in sync.
import type { Editor } from '@tiptap/core';

export function attrDefault(editor: Editor | null, type: string, attr: string): unknown {
  return editor?.schema.nodes[type]?.spec.attrs?.[attr]?.default;
}

function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === 'object' && typeof b === 'object') return JSON.stringify(a) === JSON.stringify(b);
  return false;
}

// An unset attr never counts; a set one counts when it differs from the spec
// default or the spec declares none.
export function anyAttrModified(
  editor: Editor | null,
  type: string,
  attrs: Record<string, unknown>,
  keys: string[]
): boolean {
  return keys.some((k) => {
    const v = attrs[k];
    if (v == null) return false;
    const d = attrDefault(editor, type, k);
    return d == null ? true : !same(v, d);
  });
}
