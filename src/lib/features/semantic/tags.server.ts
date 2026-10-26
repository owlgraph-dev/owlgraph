// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { db } from '$lib/platform/db.server';
import { readableNodes } from '$lib/features/nodes/server';

function cleanTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tags) {
    const tag = String(t ?? '').trim().replace(/\s+/g, ' ');
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue; // dedupe case-insensitively, keep first casing
    seen.add(key);
    out.push(tag);
  }
  return out;
}

export async function getNodeTags(id: string): Promise<string[]> {
  const rows = await db<{ tag: string }[]>`select tag from node_tags where node_id = ${id} order by tag`;
  return rows.map((r) => r.tag);
}

// Replaces them wholesale; returns the cleaned, stored list.
export async function setNodeTags(id: string, tags: unknown): Promise<string[]> {
  const clean = cleanTags(tags);
  await db.begin(async (sql) => {
    await sql`delete from node_tags where node_id = ${id}`;
    for (const tag of clean) {
      await sql`insert into node_tags (node_id, tag) values (${id}, ${tag}) on conflict do nothing`;
    }
  });
  return clean;
}

// Not viewer-scoped: the caller filters the rows to what the viewer may read.
export async function findPagesByTag(tag: string) {
  return db`
    select p.id, n.slug, n.title
    from node_tags t join pages p on p.id = t.node_id join nodes n on n.id = p.id
    where t.tag = ${tag}
    order by n.title`;
}

// Tags on nodes the user may read, counted there: a tag only hidden content
// carries is neither named nor counted.
export async function listTags(user: { id: string; role: string } | null): Promise<{ tag: string; count: number }[]> {
  return db<{ tag: string; count: number }[]>`
    select t.tag, count(*)::int as count from node_tags t join nodes n on n.id = t.node_id
    where ${readableNodes(user, 'n')}
    group by t.tag order by t.tag`;
}

// Readable tags, each once case-insensitively. Capped: suggestions, not a catalog.
export async function listTagsForUser(user: { id: string; role: string } | null, limit = 200): Promise<string[]> {
  const rows = await db<{ tag: string }[]>`
    select min(t.tag) as tag from node_tags t join nodes n on n.id = t.node_id
    where ${readableNodes(user, 'n')}
    group by lower(t.tag) order by lower(t.tag) limit ${limit}`;
  return rows.map((r) => r.tag);
}

// Not viewer-scoped: pass only ids already read under the viewer's permissions.
export async function getTagsForNodes(ids: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (!ids.length) return out;
  const rows = await db<{ node_id: string; tag: string }[]>`
    select node_id, tag from node_tags where node_id = any(${ids}::uuid[]) order by lower(tag)`;
  for (const r of rows) out.set(r.node_id, [...(out.get(r.node_id) ?? []), r.tag]);
  return out;
}
