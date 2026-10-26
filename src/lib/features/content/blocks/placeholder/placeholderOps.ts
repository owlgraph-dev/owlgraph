// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The placeholder's live-editor helpers; its JSON operations are in placeholderDoc.ts.
import { Fragment } from '@tiptap/pm/model';
import { writable } from 'svelte/store';
import type { JsonNode } from '../../doc/doc';

type N = any;

// The NodeView's "+" sets this; DesktopEditor.svelte opens the insert menu over it.
export const placeholderMenuTarget = writable<{ pos: number; rect: DOMRect } | null>(null);

export function makePlaceholder() {
  return { type: 'placeholder' };
}

// A merged cell's content without placeholders, or one placeholder if nothing else is left.
export function normalizeCellContent(fragment: Fragment, schema: N): Fragment {
  const kept: N[] = [];
  fragment.forEach((n: N) => {
    if (n.type.name !== 'placeholder') kept.push(n);
  });
  if (kept.length === 0) return Fragment.from(schema.nodes.placeholder.create());
  return Fragment.fromArray(kept);
}
