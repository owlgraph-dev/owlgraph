// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The node picker's rules, apart from its markup so they test as a table.
import type { NodeSearchResult } from '../types';
import type { NodeType } from '$lib/features/nodes';

/** What a consumer says about a row — never decided by the picker. */
export interface NodeMark {
  /** Shown beside the row at full contrast: "In this collection", "Its integration is turned off". */
  note: string;
  /** Cannot be picked: aria-disabled, skipped by the arrow keys, its title muted. */
  disabled?: boolean;
}

/** Making a node from the picker: of which types (in this order), and where. */
export interface NodePickerCreate {
  types: readonly NodeType[];
  /** The namespace new nodes go into, named in their rows; `slug` null for the default namespace. */
  namespace: { id: string; name: string; slug: string | null };
}

/** A caller's own row before the matches ("Link to …"); picking it is the caller's. */
export interface PickerRow {
  /** Unique among the rows (the highlight's value). */
  value: string;
  glyph: string;
  title: string;
  meta?: string;
  /** What Enter does on it ("Link"). */
  action: string;
  onSelect: () => void;
}

/** Null when `id` is not among the route's namespaces. */
export function pickerNamespace(
  namespaces: readonly { id: string; name: string; slug: string | null; isDefault: boolean }[],
  id: string | null | undefined
): NodePickerCreate['namespace'] | null {
  const ns = id ? namespaces.find((n) => n.id === id) : undefined;
  return ns ? { id: ns.id, name: ns.name, slug: ns.isDefault ? null : ns.slug } : null;
}

/** All of the picker's types, or one of them (its scope chips). */
export type NodePickerScope = 'all' | NodeType;

export function scopeTypes(scope: NodePickerScope, types: readonly NodeType[]): NodeType[] {
  return scope === 'all' ? [...types] : types.filter((t) => t === scope);
}

/**
 * The types a "New …" row is offered for: never one that already has a node
 * titled exactly as typed, which is listed first instead.
 */
export function createRowTypes(input: {
  query: string;
  scope: NodePickerScope;
  types: readonly NodeType[];
  create: readonly NodeType[] | null;
  exact: readonly NodeType[];
  canCreate: boolean;
}): NodeType[] {
  if (!input.create || !input.canCreate || input.query.trim() === '') return [];
  return input.create.filter(
    (t, i, all) => all.indexOf(t) === i && input.types.includes(t) && (input.scope === 'all' || input.scope === t) && !input.exact.includes(t)
  );
}

/** In order, each node once. */
export function appendPage(shown: readonly NodeSearchResult[], page: readonly NodeSearchResult[]): NodeSearchResult[] {
  const seen = new Set(shown.map((r) => r.id));
  return [...shown, ...page.filter((r) => !seen.has(r.id))];
}
