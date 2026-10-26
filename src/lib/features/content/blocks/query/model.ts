// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The attrs the page render reads; the query definition is the query
// feature's QueryBlockAttrs.
import type { SpacedBlockAttrs } from '../../doc/blockAttrs';
import type { PlacementData } from '../../capabilities/placement/placement';
import type { WrapperMapping } from '../../template/templateBinding';

export interface QueryBlockNodeAttrs extends SpacedBlockAttrs {
  format?: unknown;
  formatOptions?: unknown;
  mapping?: WrapperMapping | null;
  width?: string;
  placement?: PlacementData | null;
  bleedToTop?: boolean;
}
