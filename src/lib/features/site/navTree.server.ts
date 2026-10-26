// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The one-level tree behind both the header nav and the footer's link columns
// (the table nav_tree_entries). A node is a `group` (a label with `link`
// children) or a `link` (no children). A consumer's policy, such as the
// footer's groups-only top level, is its callers' to apply.
import { db } from '$lib/platform/db.server';
import { readablePageIds } from '$lib/features/pages/server';
import { namespaceJoin, namespaceSlugColumn } from '$lib/features/nodes/server';
import { nodePath } from '$lib/features/nodes';
import { safeTargetHref } from '$lib/features/content';
import type { SessionUser } from '$lib/features/auth/server';

import type { TreeConsumer, TreeNodeKind, TreeTargetType, TreeNodeRow, TreeNodeAdminRow, TreeNodeAdminWithChildren, TreeCreateInput, TreeUpdateInput, ResolvedTreeLink, ResolvedTreeGroup, ResolvedTreeNode } from './types';
import { CodedError } from '$lib/platform/codedError';
export type { TreeConsumer, TreeNodeKind, TreeTargetType, TreeNodeRow, TreeNodeAdminRow, TreeNodeAdminWithChildren, TreeCreateInput, TreeUpdateInput, ResolvedTreeLink, ResolvedTreeGroup, ResolvedTreeNode };

// Mirrors nav_tree_entries_shape_check, for a friendly error instead of a constraint violation.
function validateShape(
  kind: TreeNodeKind,
  label: string,
  targetType: TreeTargetType | undefined,
  targetPageId: string | null | undefined,
  url: string | null | undefined
): { label: string; targetType: TreeTargetType | null; targetPageId: string | null; url: string | null } {
  const trimmedLabel = label.trim();
  if (!trimmedLabel) throw new CodedError('label_required', 'Label is required.');
  if (kind === 'group') {
    return { label: trimmedLabel, targetType: null, targetPageId: null, url: null };
  }
  if (targetType === 'page') {
    if (!targetPageId) throw new CodedError('page_required', 'Choose a page.');
    return { label: trimmedLabel, targetType: 'page', targetPageId, url: null };
  }
  if (targetType === 'url') {
    const trimmedUrl = (url ?? '').trim();
    if (!trimmedUrl) throw new CodedError('url_required', 'URL is required.');
    return { label: trimmedLabel, targetType: 'url', targetPageId: null, url: trimmedUrl };
  }
  throw new CodedError('invalid_target', 'Invalid target type.');
}

// One consumer's nodes with their page's title and slug, flat, for the admin editor.
export async function listTreeAdmin(consumer: TreeConsumer): Promise<TreeNodeAdminRow[]> {
  return db<TreeNodeAdminRow[]>`
    select n.id, n.consumer, n.parent_id, n.kind, n.position, n.label, n.target_type, n.target_page_id, n.url, n.created_at, n.updated_at,
           pn.title as page_title, pn.slug as page_slug, ${db.unsafe(namespaceSlugColumn())}
    from nav_tree_entries n
    left join nodes pn on pn.id = n.target_page_id ${db.unsafe(namespaceJoin('pn'))}
    where n.consumer = ${consumer}
    order by n.parent_id nulls first, n.position`;
}

export function buildAdminTree(rows: TreeNodeAdminRow[]): TreeNodeAdminWithChildren[] {
  const byParent = new Map<string, TreeNodeAdminRow[]>();
  for (const row of rows) {
    if (!row.parent_id) continue;
    const list = byParent.get(row.parent_id) ?? [];
    list.push(row);
    byParent.set(row.parent_id, list);
  }
  return rows.filter((r) => !r.parent_id).map((r) => ({ ...r, children: byParent.get(r.id) ?? [] }));
}

export async function createTreeNode(consumer: TreeConsumer, input: TreeCreateInput): Promise<TreeNodeRow> {
  const shape = validateShape(input.kind, input.label, input.targetType, input.targetPageId, input.url);

  let parentId: string | null = null;
  if (input.kind === 'link' && input.parentId) {
    // Depth cap, application half: the parent must be a top-level group (the
    // DB CHECK only blocks nesting a group).
    const [parent] = await db<TreeNodeRow[]>`
      select * from nav_tree_entries where id = ${input.parentId} and consumer = ${consumer}`;
    if (!parent || parent.kind !== 'group' || parent.parent_id !== null) {
      throw new CodedError('invalid_parent', 'Invalid parent group.');
    }
    parentId = parent.id;
  }

  const [row] = await db<TreeNodeRow[]>`
    insert into nav_tree_entries (consumer, parent_id, kind, position, label, target_type, target_page_id, url)
    values (
      ${consumer}, ${parentId}, ${input.kind},
      (select coalesce(max(position), -1) + 1 from nav_tree_entries
       where consumer = ${consumer} and parent_id is not distinct from ${parentId}),
      ${shape.label}, ${shape.targetType}, ${shape.targetPageId}, ${shape.url}
    )
    returning *`;
  return row;
}

export async function updateTreeNode(id: string, input: TreeUpdateInput): Promise<void> {
  const [existing] = await db<TreeNodeRow[]>`select * from nav_tree_entries where id = ${id}`;
  if (!existing) throw new CodedError('entry_not_found', 'Entry not found.');
  // kind is fixed at creation, so validation follows the existing row's.
  const shape = validateShape(existing.kind, input.label, input.targetType, input.targetPageId, input.url);
  await db`
    update nav_tree_entries
    set label = ${shape.label}, target_type = ${shape.targetType},
        target_page_id = ${shape.targetPageId}, url = ${shape.url}, updated_at = now()
    where id = ${id}`;
}

export async function deleteTreeNode(id: string): Promise<void> {
  await db`delete from nav_tree_entries where id = ${id}`; // FK cascade removes a group's children
}

// Takes one sibling partition's full ordered id list (position has no unique constraint).
async function reorderTreeNodes(orderedIds: string[]): Promise<void> {
  await db.begin(async (sql) => {
    for (let i = 0; i < orderedIds.length; i++) {
      await sql`update nav_tree_entries set position = ${i}, updated_at = now() where id = ${orderedIds[i]}`;
    }
  });
}

// The sibling partition comes from the row, never from a client-supplied parent.
export async function moveTreeNode(id: string, direction: 'up' | 'down'): Promise<void> {
  const [node] = await db<TreeNodeRow[]>`select * from nav_tree_entries where id = ${id}`;
  if (!node) throw new CodedError('entry_not_found', 'Entry not found.');
  const siblings = await db<TreeNodeRow[]>`
    select * from nav_tree_entries
    where consumer = ${node.consumer} and parent_id is not distinct from ${node.parent_id}
    order by position`;
  const idx = siblings.findIndex((s) => s.id === id);
  const swapWith = direction === 'up' ? idx - 1 : idx + 1;
  if (idx === -1 || swapWith < 0 || swapWith >= siblings.length) return;
  const ids = siblings.map((s) => s.id);
  [ids[idx], ids[swapWith]] = [ids[swapWith], ids[idx]];
  await reorderTreeNodes(ids);
}

// Nests a top-level link into the group above it, at the end of its children.
export async function indentTreeNode(id: string): Promise<void> {
  const [node] = await db<TreeNodeRow[]>`select * from nav_tree_entries where id = ${id}`;
  if (!node) throw new CodedError('entry_not_found', 'Entry not found.');
  if (node.kind !== 'link' || node.parent_id !== null) throw new CodedError('nest_top_level_only', 'Only a top-level link can be nested.');

  const topLevel = await db<TreeNodeRow[]>`
    select * from nav_tree_entries where consumer = ${node.consumer} and parent_id is null order by position`;
  const idx = topLevel.findIndex((s) => s.id === id);
  const prev = idx > 0 ? topLevel[idx - 1] : null;
  if (!prev || prev.kind !== 'group') throw new CodedError('nest_below_group', 'Move this entry below a group to nest it.');

  const [{ count }] = await db<{ count: number }[]>`
    select count(*)::int as count from nav_tree_entries where parent_id = ${prev.id}`;

  await db.begin(async (sql) => {
    await sql`update nav_tree_entries set parent_id = ${prev.id}, position = ${count}, updated_at = now() where id = ${id}`;
    const remaining = topLevel.filter((s) => s.id !== id);
    for (let i = 0; i < remaining.length; i++) {
      await sql`update nav_tree_entries set position = ${i}, updated_at = now() where id = ${remaining[i].id}`;
    }
  });
}

// Un-nests a child link back to the top level, appended at the end.
export async function outdentTreeNode(id: string): Promise<void> {
  const [node] = await db<TreeNodeRow[]>`select * from nav_tree_entries where id = ${id}`;
  if (!node) throw new CodedError('entry_not_found', 'Entry not found.');
  if (!node.parent_id) throw new CodedError('already_top_level', 'This entry is already top-level.');
  const parentId = node.parent_id;

  const [{ count }] = await db<{ count: number }[]>`
    select count(*)::int as count from nav_tree_entries where consumer = ${node.consumer} and parent_id is null`;

  await db.begin(async (sql) => {
    await sql`update nav_tree_entries set parent_id = null, position = ${count}, updated_at = now() where id = ${id}`;
    const siblings = await sql<TreeNodeRow[]>`select * from nav_tree_entries where parent_id = ${parentId} order by position`;
    for (let i = 0; i < siblings.length; i++) {
      await sql`update nav_tree_entries set position = ${i}, updated_at = now() where id = ${siblings[i].id}`;
    }
  });
}

// The tree as this viewer may follow it, for the nav, the phone's menu sheet and the footer.
export async function resolveTreeForUser(consumer: TreeConsumer, user: SessionUser | null): Promise<ResolvedTreeNode[]> {
  const rows = await db<(TreeNodeRow & { page_slug: string | null; namespace_slug: string | null })[]>`
    select n.id, n.consumer, n.parent_id, n.kind, n.position, n.label, n.target_type, n.target_page_id, n.url, n.created_at, n.updated_at,
           pn.slug as page_slug, ${db.unsafe(namespaceSlugColumn())}
    from nav_tree_entries n
    left join nodes pn on pn.id = n.target_page_id ${db.unsafe(namespaceJoin('pn'))}
    where n.consumer = ${consumer}
    order by n.parent_id nulls first, n.position`;

  return resolveTree(rows, await readablePageIds(user));
}

/** A link row as the render-time queries read it: the target page's current slug joined in. */
export interface NavLinkRow {
  id: string;
  label: string;
  target_type: TreeTargetType | null;
  target_page_id: string | null;
  url: string | null;
  page_slug: string | null;
  namespace_slug: string | null;
}

/**
 * One link as a viewer may follow it: a page link at its target's current path,
 * or null when the viewer can't read it; a url link through safeTargetHref,
 * external unless site-relative. Shared by the tree and the footer's legal line.
 */
export function resolveNavLinkRow(row: NavLinkRow, readable: ReadonlySet<string>): { id: string; label: string; href: string; external: boolean } | null {
  if (row.target_type === 'page') {
    if (!row.target_page_id || !row.page_slug || !readable.has(row.target_page_id)) return null;
    return { id: row.id, label: row.label, href: nodePath(row.namespace_slug, row.page_slug), external: false };
  }
  const href = safeTargetHref(row.url);
  // safeTargetHref lets a site-relative path through only as `/…` (never `//host`).
  return { id: row.id, label: row.label, href, external: !href.startsWith('/') };
}

/**
 * The tree a viewer sees, from rows in parent-then-position order: links as
 * resolveNavLinkRow resolves them, and a group with no followable link dropped.
 */
export function resolveTree(rows: (NavLinkRow & { parent_id: string | null; kind: TreeNodeKind })[], readable: ReadonlySet<string>): ResolvedTreeNode[] {
  const link = (row: NavLinkRow): ResolvedTreeLink | null => {
    const resolved = resolveNavLinkRow(row, readable);
    return resolved && { ...resolved, kind: 'link' };
  };

  const childrenByParent = new Map<string, ResolvedTreeLink[]>();
  for (const row of rows) {
    if (!row.parent_id || row.kind !== 'link') continue;
    const resolved = link(row);
    if (!resolved) continue;
    const list = childrenByParent.get(row.parent_id) ?? [];
    list.push(resolved);
    childrenByParent.set(row.parent_id, list);
  }

  const result: ResolvedTreeNode[] = [];
  for (const row of rows) {
    if (row.parent_id) continue;
    if (row.kind === 'link') {
      const resolved = link(row);
      if (resolved) result.push(resolved);
    } else {
      const children = childrenByParent.get(row.id) ?? [];
      if (children.length === 0) continue;
      result.push({ id: row.id, kind: 'group', label: row.label, children });
    }
  }
  return result;
}
