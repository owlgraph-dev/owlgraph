// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// /api/node-search's parameters, read once here: every value clamped, every id
// checked, so the route hands the query nothing it didn't mean to.
import { isUuid, NODE_TYPES, type NodeType } from '$lib/features/nodes';

/** The page size a picker gets unless it asks for another, and the most it may ask for. */
export const NODE_SEARCH_LIMIT = 12;
export const NODE_SEARCH_MAX_LIMIT = 50;
/** How far a picker may page: past this, a narrower term is the way on. */
export const NODE_SEARCH_MAX_OFFSET = 1000;
/** How many ids a picker may leave out. */
export const NODE_SEARCH_MAX_EXCLUDE = 50;

export interface NodeSearchParams {
  q: string;
  types: NodeType[];
  limit: number;
  offset: number;
  exclude: string[];
  /** With no term: the nodes the viewer worked on last rather than the most recently changed (`recent=1`). */
  recent: boolean;
}

const int = (raw: string | null, fallback: number, min: number, max: number) => {
  const n = raw === null || raw.trim() === '' ? NaN : Number(raw);
  return Number.isInteger(n) ? Math.min(Math.max(n, min), max) : fallback;
};

/** Null without `types`, which the route refuses. */
export function parseNodeSearchParams(params: URLSearchParams): NodeSearchParams | null {
  const types = params.get('types');
  if (types === null) return null;
  const named = types.split(',').map((t) => t.trim());
  return {
    q: (params.get('q') ?? '').trim(),
    types: NODE_TYPES.filter((t) => named.includes(t)),
    limit: int(params.get('limit'), NODE_SEARCH_LIMIT, 1, NODE_SEARCH_MAX_LIMIT),
    offset: int(params.get('offset'), 0, 0, NODE_SEARCH_MAX_OFFSET),
    exclude: [...new Set((params.get('exclude') ?? '').split(',').map((id) => id.trim()).filter(isUuid))].slice(0, NODE_SEARCH_MAX_EXCLUDE),
    recent: params.get('recent') === '1',
  };
}
