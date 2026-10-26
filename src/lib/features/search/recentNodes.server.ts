// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Before anything is typed: the readable nodes the viewer last saved or made
// (docs/architecture/search.md, "The node picker"). None without a session.
import type { SessionUser } from '$lib/features/auth/server';
import { db } from '$lib/platform/db.server';
import { namespaceJoin, namespaceSlugColumn, readableNodes, type NodeSearchHit, type NodeType } from '$lib/features/nodes/server';

export async function recentNodesForUser(
  user: SessionUser | null,
  opts: { types: readonly NodeType[]; limit: number; exclude?: readonly string[] }
): Promise<NodeSearchHit[]> {
  if (!user || opts.types.length === 0) return [];
  const limit = Math.min(Math.max(opts.limit, 1), 50);
  const kept = opts.exclude?.length ? db`n.id not in ${db(opts.exclude as string[])}` : db`true`;
  return db<NodeSearchHit[]>`
    with mine as (
      select v.node_id as id, v.updated_at as at from node_versions v join nodes vn on vn.id = v.node_id
      where vn.type = 'page' and v.author_id = ${user.id}
      union all
      select id, updated_at as at from nodes where created_by = ${user.id}
    )
    select n.id, n.type, n.title, n.slug, ${db.unsafe(namespaceSlugColumn())}, ns.name as namespace_name
    from mine join nodes n on n.id = mine.id ${db.unsafe(namespaceJoin('n'))}
    where n.type in ${db(opts.types as NodeType[])} and ${kept} and ${readableNodes(user, 'n')}
    group by n.id, n.type, n.title, n.slug, ns.slug, ns.name
    order by max(mine.at) desc, n.id
    limit ${limit}`;
}
