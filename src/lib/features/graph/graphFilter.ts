// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Client-side narrowing of an already viewer-scoped graph, in the query model's
// vocabulary (a class admits its subclasses, as IS_A). An empty set constrains nothing.
import type { GraphNode, GraphEdge } from './types';
import { subtreeOf, type NodeClassOption } from '$lib/features/semantic';
import type { NodeType } from '$lib/features/nodes';

export interface GraphFilter {
  types: Set<NodeType>;
  classIds: Set<string>;
  namespaceIds: Set<string>;
  relationshipTypes: Set<string>; // slugs
  hideUnconnected: boolean;
}

export const EMPTY_FILTER: GraphFilter = {
  types: new Set(),
  classIds: new Set(),
  namespaceIds: new Set(),
  relationshipTypes: new Set(),
  hideUnconnected: false,
};

export function isFilterEmpty(f: GraphFilter): boolean {
  return f.types.size === 0 && f.classIds.size === 0 && f.namespaceIds.size === 0 && f.relationshipTypes.size === 0 && !f.hideUnconnected;
}

/** Every chosen value counts, and the hide-unconnected switch: the phone sheet's "Filter · N". */
export function activeFilterCount(f: GraphFilter): number {
  return f.types.size + f.classIds.size + f.namespaceIds.size + f.relationshipTypes.size + (f.hideUnconnected ? 1 : 0);
}

// Every picked class plus its subtree, over the parent links the server's recursive CTE follows.
export function expandClassIds(classIds: ReadonlySet<string>, classOptions: readonly NodeClassOption[]): Set<string> {
  const rows = classOptions.map((c) => ({ id: c.id, parent_id: c.parentId, property_group: null }));
  const out = new Set<string>();
  for (const id of classIds) for (const d of subtreeOf(rows, id)) out.add(d);
  return out;
}

export interface FilteredGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export function applyGraphFilter(
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[],
  filter: GraphFilter,
  classOptions: readonly NodeClassOption[]
): FilteredGraph {
  if (isFilterEmpty(filter)) return { nodes: [...nodes], edges: [...edges] };

  const admittedClasses = filter.classIds.size ? expandClassIds(filter.classIds, classOptions) : null;
  const passes = (n: GraphNode): boolean => {
    if (filter.types.size && !filter.types.has(n.type ?? 'page')) return false;
    if (admittedClasses && !(n.classId && admittedClasses.has(n.classId))) return false;
    if (filter.namespaceIds.size && !(n.namespaceId && filter.namespaceIds.has(n.namespaceId))) return false;
    return true;
  };

  const visibleIds = new Set(nodes.filter(passes).map((n) => n.id));
  // An edge needs both ends, as on the server; an untyped one never matches a relationship filter.
  const visibleEdges = edges.filter(
    (e) =>
      visibleIds.has(e.source) &&
      visibleIds.has(e.target) &&
      (filter.relationshipTypes.size === 0 || (e.relationshipType != null && filter.relationshipTypes.has(e.relationshipType)))
  );

  if (filter.hideUnconnected) {
    const connected = new Set<string>();
    for (const e of visibleEdges) {
      if (e.source === e.target) continue;
      connected.add(e.source);
      connected.add(e.target);
    }
    for (const id of visibleIds) if (!connected.has(id)) visibleIds.delete(id);
  }

  return { nodes: nodes.filter((n) => visibleIds.has(n.id)), edges: visibleEdges };
}

// The types on the edges this viewer was given, for the filter's picker.
export function relationshipTypeItems(edges: readonly GraphEdge[]): { value: string; label: string }[] {
  const byType = new Map<string, string>();
  for (const e of edges) {
    if (e.relationshipType && !byType.has(e.relationshipType)) byType.set(e.relationshipType, e.relationshipLabel ?? e.relationshipType);
  }
  return [...byType].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
}
