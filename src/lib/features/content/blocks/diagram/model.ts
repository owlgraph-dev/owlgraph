// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The Mermaid source only, never the drawing, which is made wherever the block
// is shown, in its canvas's colours.
import type { SpacedBlockAttrs } from '../../doc/blockAttrs';

export interface DiagramAttrs extends SpacedBlockAttrs {
  code?: string;
}
