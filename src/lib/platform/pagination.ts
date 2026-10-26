// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The result-window cost guard for every list query (GraphQL, MCP, search, the
// graph); filter-tree caps live in features/query/nodeFilter.ts.
const MAX_FIRST = 50;

export function clampFirst(first: number | null | undefined, fallback = 20): number {
  return Math.min(Math.max(first ?? fallback, 1), MAX_FIRST);
}

export function clampOffset(offset: number | null | undefined): number {
  return Math.max(offset ?? 0, 0);
}
