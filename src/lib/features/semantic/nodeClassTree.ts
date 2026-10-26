// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Pure walks over the loaded class list, rows linked by parent_id.

export type NodeClassTreeRow = {
  id: string;
  parent_id: string | null;
  property_group: string | null;
};

/** Every class directly followed by its subtree, siblings by `compare`. A row
 * whose parent isn't in `rows` starts a tree of its own. */
export function orderClassTree<T extends { id: string; parent_id: string | null }>(rows: readonly T[], compare: (a: T, b: T) => number): T[] {
  const ids = new Set(rows.map((r) => r.id));
  const children = new Map<string, T[]>();
  const roots: T[] = [];
  for (const r of rows) {
    if (r.parent_id === null || !ids.has(r.parent_id)) {
      roots.push(r);
    } else {
      const siblings = children.get(r.parent_id) ?? [];
      siblings.push(r);
      children.set(r.parent_id, siblings);
    }
  }
  const out: T[] = [];
  const seen = new Set<string>();
  const visit = (level: T[]) => {
    for (const r of [...level].sort(compare)) {
      if (seen.has(r.id)) continue; // a cycle the constraints should make impossible
      seen.add(r.id);
      out.push(r);
      visit(children.get(r.id) ?? []);
    }
  };
  visit(roots);
  return out;
}

/** The chain above `id`: parent, grandparent, …, root (nearest first). */
function ancestorsOf<T extends NodeClassTreeRow>(classes: readonly T[], id: string | null): T[] {
  const byId = new Map(classes.map((c) => [c.id, c]));
  const out: T[] = [];
  let cur = id ? byId.get(id) : undefined;
  while (cur) {
    out.push(cur);
    cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
  }
  return out;
}

/** What a class can never be moved under. The server refuses a cycle too; this
 * keeps the impossible choices out of the picker. */
export function subtreeOf(classes: readonly NodeClassTreeRow[], id: string): Set<string> {
  const out = new Set<string>([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const c of classes) {
      if (c.parent_id && out.has(c.parent_id) && !out.has(c.id)) {
        out.add(c.id);
        grew = true;
      }
    }
  }
  return out;
}

/** The groups a class's nodes get from its ancestors, nearest first. */
export function inheritedGroups(classes: readonly NodeClassTreeRow[], parentId: string | null): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const a of ancestorsOf(classes, parentId)) {
    if (a.property_group && !seen.has(a.property_group)) {
      seen.add(a.property_group);
      out.push(a.property_group);
    }
  }
  return out;
}
