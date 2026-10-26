// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The wrapper and the props, for the editor and the page. The props are plain
// JSON: on the page they travel in the island's attribute.
import { spaceAboveOverrides } from '../../capabilities/spacing/spacing';
import type { BlockWrapper } from '../scaffold/blockWrapper';
import type { DiagramAttrs } from './model';

export function diagramWrapper(attrs: DiagramAttrs | undefined): BlockWrapper {
  return {
    classes: ['diagram-block'],
    blockId: attrs?.blockId ?? null,
    overrides: spaceAboveOverrides(attrs),
  };
}

/** What a diagram says when it shows no drawing. */
export interface DiagramTexts {
  waiting: string;
  /** Before the drawing's error message. */
  failed: string;
  /** The editor's hint for a block with no source; null on the page. */
  empty: string | null;
}

export function diagramProps(attrs: DiagramAttrs, texts: DiagramTexts) {
  return { code: String(attrs.code ?? ''), ...texts };
}
