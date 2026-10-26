// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The `edges` table (source -> target, optionally typed) is regenerated from a
// page's content on every save, so the graph never drifts from the content.
// Viewer scoping is readableNodes throughout.
import { db, type TxSql } from '$lib/platform/db.server';
import { labelCache, type LocalizedText } from '$lib/platform/i18n/localizedText';
import { timed } from '$lib/platform/logger.server';
import type { SessionUser } from '$lib/features/auth/server';
import { readableNodes, namespaceJoin, namespaceSlugColumn } from '$lib/features/nodes/server';
import { applyEdgeProperties, getEdgeProperties } from './edges.server';
import { blockEdges, isUnknownType, type BlockEdge, type JsonNode } from '$lib/features/content';
import type { NodeType } from '$lib/features/nodes';

// A block's declared link, or an inline pageLink/docLink mark (always untyped).
export type EdgeDraft = BlockEdge;

export function collectEdges(node: JsonNode | null | undefined, out: EdgeDraft[]) {
  // A block this build cannot read declares no edge until its kind is back (docs/architecture/blocks/anatomy.md, "Unknown blocks").
  if (!node || isUnknownType(node)) return;
  out.push(...blockEdges(node));
  for (const mark of node.marks ?? []) {
    if (mark.type === 'pageLink' && mark.attrs?.targetPageId) out.push({ targetId: String(mark.attrs.targetPageId), relationshipType: null, properties: [] });
    if (mark.type === 'docLink' && mark.attrs?.targetDocId) out.push({ targetId: String(mark.attrs.targetDocId), relationshipType: null, properties: [] });
  }
  for (const child of node.content ?? []) collectEdges(child, out);
}

// Keyed by (target, type): a surviving pair keeps its `edges.id`, and a changed
// type is a delete plus an insert that drops the old properties. Self-links and
// missing targets are skipped; a type that no longer exists becomes untyped
// rather than failing the save. Timed under a label, never SQL text or
// parameters (docs/architecture/logging.md, "Performance and limits").
export function syncEdges(...args: Parameters<typeof syncEdgesImpl>): ReturnType<typeof syncEdgesImpl> {
  return timed('graph.sync_edges', () => syncEdgesImpl(...args)) as ReturnType<typeof syncEdgesImpl>;
}

async function syncEdgesImpl(sql: TxSql, sourceId: string, doc: JsonNode) {
  const drafts: EdgeDraft[] = [];
  collectEdges(doc, drafts);
  const raw = drafts.filter((d) => d.targetId !== sourceId);

  if (raw.length === 0) {
    await sql`delete from edges where source_id = ${sourceId}`;
    return;
  }

  const targetIds = [...new Set(raw.map((d) => d.targetId))];
  const typeSlugs = [...new Set(raw.map((d) => d.relationshipType).filter((t): t is string => t != null))];
  const [existingTargets, existingTypes] = await Promise.all([
    sql<{ id: string }[]>`select id from nodes where id in ${sql(targetIds)}`,
    typeSlugs.length ? sql<{ slug: string }[]>`select slug from relationship_types where slug in ${sql(typeSlugs)}` : Promise.resolve([] as { slug: string }[]),
  ]);
  const validTargets = new Set(existingTargets.map((r) => r.id));
  const validTypes = new Set(existingTypes.map((r) => r.slug));

  const coerced = raw
    .filter((d) => validTargets.has(d.targetId))
    .map((d) => (d.relationshipType && !validTypes.has(d.relationshipType) ? { targetId: d.targetId, relationshipType: null, properties: [] } : d));

  // After coercion, which can collapse two keys onto one untyped pair; the
  // first in document order wins.
  const desiredByKey = new Map<string, EdgeDraft>();
  for (const d of coerced) {
    const key = `${d.targetId} ${d.relationshipType ?? ''}`;
    if (!desiredByKey.has(key)) desiredByKey.set(key, d);
  }

  if (desiredByKey.size === 0) {
    await sql`delete from edges where source_id = ${sourceId}`;
    return;
  }

  const existing = await sql<{ id: string; target_id: string; relationship_type: string | null }[]>`
    select id, target_id, relationship_type from edges where source_id = ${sourceId}`;
  const existingByKey = new Map(existing.map((r) => [`${r.target_id} ${r.relationship_type ?? ''}`, r]));

  const toDelete = existing.filter((r) => !desiredByKey.has(`${r.target_id} ${r.relationship_type ?? ''}`));
  if (toDelete.length) {
    await sql`delete from edges where id in ${sql(toDelete.map((r) => r.id))}`;
  }

  for (const [key, d] of desiredByKey) {
    const match = existingByKey.get(key);
    if (match) {
      await applyEdgeProperties(sql, match.id, d.properties);
      continue;
    }
    const [row] = await sql<{ id: string }[]>`
      insert into edges (source_id, target_id, relationship_type)
      values (${sourceId}, ${d.targetId}, ${d.relationshipType})
      on conflict (source_id, target_id, coalesce(relationship_type, '')) do nothing
      returning id`;
    if (row) await applyEdgeProperties(sql, row.id, d.properties);
  }
}

// Pages this page links to, one row per page (several edges can share a pair),
// only those the viewer may read: a readable page can link to one they may not,
// and its title is not theirs to learn.
export async function getOutgoingEdges(id: string, user: SessionUser | null = null) {
  return db`
    select distinct p.id, n.slug, n.title, 'links_to' as relation
    from edges l
    join pages p on p.id = l.target_id
    join nodes n on n.id = p.id
    where l.source_id = ${id} and ${readableNodes(user, 'n')}
    order by n.title`;
}

// Readable pages linking to this page or document. Sources are always pages:
// documents have no content to link from.
export async function getIncomingEdges(nodeId: string, user: SessionUser | null = null) {
  return db`
    select distinct p.id, n.slug, ${db.unsafe(namespaceSlugColumn())}, n.title, 'links_to' as relation
    from edges l
    join pages p on p.id = l.source_id
    join nodes n on n.id = p.id ${db.unsafe(namespaceJoin('n'))}
    where l.target_id = ${nodeId} and ${readableNodes(user, 'n')}
    order by n.title`;
}

// Only the nodes the viewer may read, and the edges between them.
export async function getGraph(user: SessionUser | null = null) {
  const nodeRows = await db<{ id: string; type: NodeType; slug: string; namespace_slug: string | null; title: string; class_id: string; namespace_id: string }[]>`
    select n.id, n.type, n.slug, ${db.unsafe(namespaceSlugColumn())}, n.title, n.class_id, n.namespace_id
    from nodes n ${db.unsafe(namespaceJoin('n'))}
    where ${readableNodes(user, 'n')}
    order by n.title`;

  const edgeRows = await db<{ edge_id: string; source: string; target: string; relationship_type: string | null; relationship_label: LocalizedText | null }[]>`
    select l.id as edge_id, l.source_id as source, l.target_id as target, l.relationship_type, rt.label as relationship_label
    from edges l
    join nodes s on s.id = l.source_id
    join nodes t on t.id = l.target_id
    left join relationship_types rt on rt.slug = l.relationship_type
    where ${readableNodes(user, 's')} and ${readableNodes(user, 't')}`;

  const propsByEdgeId = await getEdgeProperties(edgeRows.map((e) => e.edge_id));
  const label = labelCache();

  return {
    nodes: nodeRows.map((n) => ({ id: n.id, type: n.type, slug: n.slug, namespaceSlug: n.namespace_slug, title: n.title, classId: n.class_id, namespaceId: n.namespace_id })),
    edges: edgeRows.map((e) => ({
      source: e.source,
      target: e.target,
      edgeId: e.edge_id,
      ...(e.relationship_type
        ? {
            relationshipType: e.relationship_type,
            relationshipLabel: label(e.relationship_type, e.relationship_label),
            ...(propsByEdgeId.has(e.edge_id) ? { properties: propsByEdgeId.get(e.edge_id) } : {}),
          }
        : {}),
    })),
  };
}

// A page's depth-1 neighbourhood, viewer-scoped, for the local graph.
export async function getLocalGraph(pageId: string, user: SessionUser | null = null) {
  const [center] = await db<{ id: string; slug: string; namespace_slug: string | null; title: string; class_id: string; namespace_id: string }[]>`
    select n.id, n.slug, ${db.unsafe(namespaceSlugColumn())}, n.title, n.class_id, n.namespace_id
    from nodes n ${db.unsafe(namespaceJoin('n'))} where n.id = ${pageId}`;
  if (!center) return { nodes: [], edges: [], focusId: pageId };

  // One row per incident edge, not per neighbour: an untyped and a typed edge
  // to the same neighbour both render. Nodes are deduped below.
  const rows = await db<{
    edge_id: string;
    neighbor_id: string;
    type: NodeType;
    slug: string;
    namespace_slug: string | null;
    title: string;
    class_id: string;
    namespace_id: string;
    relationship_type: string | null;
    relationship_label: LocalizedText | null;
  }[]>`
    select l.id as edge_id, n.id as neighbor_id, n.type, n.slug, ${db.unsafe(namespaceSlugColumn())}, n.title, n.class_id, n.namespace_id,
           l.relationship_type, rt.label as relationship_label
    from edges l
    join nodes n on n.id = (case when l.source_id = ${pageId} then l.target_id else l.source_id end) ${db.unsafe(namespaceJoin('n'))}
    left join relationship_types rt on rt.slug = l.relationship_type
    where (l.source_id = ${pageId} or l.target_id = ${pageId})
      and n.id <> ${pageId}
      and ${readableNodes(user, 'n')}`;

  const propsByEdgeId = await getEdgeProperties(rows.map((r) => r.edge_id));
  const label = labelCache();

  const neighborNodes = new Map<string, { id: string; type: NodeType; slug: string; namespaceSlug: string | null; title: string; classId: string; namespaceId: string }>();
  for (const r of rows) {
    if (neighborNodes.has(r.neighbor_id)) continue;
    neighborNodes.set(r.neighbor_id, { id: r.neighbor_id, type: r.type, slug: r.slug, namespaceSlug: r.namespace_slug, title: r.title, classId: r.class_id, namespaceId: r.namespace_id });
  }

  const nodes = [
    { id: center.id, type: 'page' as const, slug: center.slug, namespaceSlug: center.namespace_slug, title: center.title, classId: center.class_id, namespaceId: center.namespace_id },
    ...neighborNodes.values(),
  ];
  // Every edge points centre -> neighbour, incoming ones too: the local graph shows no direction.
  const edges = rows.map((r) => ({
    source: center.id,
    target: r.neighbor_id,
    edgeId: r.edge_id,
    ...(r.relationship_type
      ? {
          relationshipType: r.relationship_type,
          relationshipLabel: label(r.relationship_type, r.relationship_label),
          ...(propsByEdgeId.has(r.edge_id) ? { properties: propsByEdgeId.get(r.edge_id) } : {}),
        }
      : {}),
  }));
  return { nodes, edges, focusId: center.id };
}

// Target id -> current path (no leading "/") for every page and document this
// page links to, so rendered links survive a rename. Not viewer-scoped.
export async function linkSlugMap(id: string): Promise<Record<string, string>> {
  const rows = await db<{ id: string; path: string }[]>`
    select distinct n.id, case when ns.slug is not null then ns.slug || '/' || n.slug else n.slug end as path
    from edges l join nodes n on n.id = l.target_id ${db.unsafe(namespaceJoin('n'))}
    where l.source_id = ${id}`;
  const map: Record<string, string> = {};
  for (const r of rows) map[r.id] = r.path;
  return map;
}

// linkSlugMap for a share link: only targets an anonymous viewer could read,
// so the hrefs leak no hidden namespace's slug. Kept a separate copy so the
// one added predicate stays visible.
export async function publicLinkSlugMap(id: string): Promise<Record<string, string>> {
  const rows = await db<{ id: string; path: string }[]>`
    select distinct n.id, case when ns.slug is not null then ns.slug || '/' || n.slug else n.slug end as path
    from edges l join nodes n on n.id = l.target_id ${db.unsafe(namespaceJoin('n'))}
    where l.source_id = ${id} and ${readableNodes(null, 'n')}`;
  const map: Record<string, string> = {};
  for (const r of rows) map[r.id] = r.path;
  return map;
}
