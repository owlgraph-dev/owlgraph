// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// What QueryBuilderModal.svelte loads from and saves to a queryBlock's attrs.
// `filter` and `traversal` are mutually exclusive, as in the block's own attrs.
import type { WireNodeFilter, WireOrderByInput } from './nodeFilter';
import type { WireTraversalQuery } from './traversal';
import type { WrapperMapping } from '$lib/features/content';

export interface QueryDefinition {
  filter: WireNodeFilter | null;
  traversal: WireTraversalQuery | null;
  fromCurrentPage: boolean;
  first: number;
  orderBy: WireOrderByInput | null;
  format: 'template';
  mapping: WrapperMapping | null;
  // Reserved for result aggregation; never populated or persisted.
  aggregation?: unknown;
}
