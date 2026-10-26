// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// What every block's attrs share; a block's own are in its model.ts. Optional
// throughout, since stored documents may predate an attribute. The Tiptap
// nodes decide what is written; these describe what a walker may read.
import type { SpacingData } from '../capabilities/spacing/spacing';

export interface BlockIdAttrs {
  blockId?: string;
}

/** A spaced block's `spaceAbove` override, added by the BlockSpacing extension (blocks/shared/blockSpacing.ts). */
export interface SpacedBlockAttrs extends BlockIdAttrs {
  spacing?: SpacingData | null;
}
