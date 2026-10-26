// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Pure, so the ordering rules are testable without a database.

/** Null for a stored value that isn't a whole number. */
export function positionOf(value: string | null | undefined): number | null {
  if (value == null || !/^-?\d{1,9}$/.test(value.trim())) return null;
  return Number(value.trim());
}

/** One past the largest held, 1 for the first. */
export function nextPosition(values: readonly (string | null | undefined)[]): number {
  let max = 0;
  for (const value of values) {
    const position = positionOf(value);
    if (position !== null && position > max) max = position;
  }
  return max + 1;
}

/** By position, members without one last, ties by title. */
export function compareMembers(a: { position: number | null; title: string }, b: { position: number | null; title: string }): number {
  if (a.position !== b.position) {
    if (a.position === null) return 1;
    if (b.position === null) return -1;
    return a.position - b.position;
  }
  return a.title.localeCompare(b.title);
}

/** Whether `order` names each of `ids` exactly once and nothing else. */
export function isReorderOf(ids: readonly string[], order: readonly string[]): boolean {
  if (order.length !== ids.length) return false;
  const wanted = new Set(ids);
  const seen = new Set<string>();
  for (const id of order) {
    if (!wanted.has(id) || seen.has(id)) return false;
    seen.add(id);
  }
  return true;
}

/**
 * Every member the editor may not read keeps its own slot, so a reorder never
 * moves or reveals what someone cannot see.
 */
export function mergeVisibleOrder(all: readonly string[], visible: ReadonlySet<string>, order: readonly string[]): string[] {
  let next = 0;
  return all.map((id) => (visible.has(id) ? order[next++] : id));
}
