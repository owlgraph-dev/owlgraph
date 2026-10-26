// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Edge property values (edge_properties) and a node's typed edges. The
// relationship-type catalogue is the semantic feature's.
import { db, type TxSql } from '$lib/platform/db.server';
import { labelCache, localize, hasText, type LocalizedText } from '$lib/platform/i18n/localizedText';
import * as m from '$lib/paraglide/messages';
import { nodePath, type RelationshipGroupView } from '$lib/features/nodes';
import { namespaceJoin, namespaceSlugColumn, readableNodes, type NodeType } from '$lib/features/nodes/server';
import type { SessionUser } from '$lib/features/auth/server';
import { clampFirst } from '$lib/platform/pagination';
import { getExistingRelationshipTypeSlugs } from '$lib/features/semantic/server';
import { LOCALIZED_TEXT_DATATYPE } from '$lib/features/semantic';
import { hydrateContentNodes, type TraversalNodeHit } from '$lib/features/query/server';
import type { EdgeDirection } from '$lib/features/query';

// Batched for display: labels, and values that are one text per language, come
// out in the reader's language, never as the stored JSON.
export async function getEdgeProperties(edgeIds: string[]): Promise<Map<string, { name: string; label: string; value: string }[]>> {
  if (edgeIds.length === 0) return new Map();
  const rows = await db<{ edge_id: string; name: string; label: LocalizedText; datatype: string; value: string }[]>`
    select lp.edge_id, lp.name, pd.label, pd.datatype, lp.value
    from edge_properties lp
    join property_definitions pd on pd.name = lp.name
    where lp.edge_id in ${db(edgeIds)}
    order by lp.edge_id, pd.name`;
  const label = labelCache();
  const map = new Map<string, { name: string; label: string; value: string }[]>();
  for (const r of rows) {
    const list = map.get(r.edge_id) ?? [];
    list.push({ name: r.name, label: label(r.name, r.label), value: r.datatype === LOCALIZED_TEXT_DATATYPE ? localizedValue(r.value) : r.value });
    map.set(r.edge_id, list);
  }
  return map;
}

/** A stored one-text-per-language value, in the reader's language ('' for one that is not such a value). */
function localizedValue(value: string): string {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? localize(parsed as LocalizedText, '') : '';
  } catch {
    return '';
  }
}

// Replaced wholesale: edge_properties rows have no identity worth a diff.
export async function applyEdgeProperties(sql: TxSql, edgeId: string, properties: { name: string; value: string }[]) {
  await sql`delete from edge_properties where edge_id = ${edgeId}`;
  for (const p of properties) {
    await sql`insert into edge_properties (edge_id, name, value) values (${edgeId}, ${p.name}, ${p.value})`;
  }
}

// A node's typed edges (MCP get_relationships); untyped edges are getOutgoingEdges/getIncomingEdges'.
export interface RelationshipEdge {
  edgeId: string;
  direction: 'outgoing' | 'incoming';
  relationshipType: string;
  relationshipLabel: string;
  inverseLabel: string | null;
  node: TraversalNodeHit;
  properties: { name: string; label: string; value: string }[];
}

function edgeDirectionPredicate(nodeId: string, direction: EdgeDirection | undefined) {
  if (direction === 'outgoing') return db`l.source_id = ${nodeId}`;
  if (direction === 'incoming') return db`l.target_id = ${nodeId}`;
  return db`(l.source_id = ${nodeId} or l.target_id = ${nodeId})`;
}

export async function getNodeRelationships(
  user: SessionUser | null,
  nodeId: string,
  opts?: { type?: string; direction?: EdgeDirection; limit?: number }
): Promise<RelationshipEdge[]> {
  if (opts?.type) {
    const valid = await getExistingRelationshipTypeSlugs([opts.type]);
    if (!valid.has(opts.type)) throw new Error(`unknown relationship type "${opts.type}"`);
  }

  // A missing or unreadable node returns [], never a distinguishable "forbidden" or "not found".
  const [center] = await db<{ id: string }[]>`select n.id from nodes n where n.id = ${nodeId} and ${readableNodes(user, 'n')}`;
  if (!center) return [];

  const typePred = opts?.type ? db`and l.relationship_type = ${opts.type}` : db``;
  const limit = clampFirst(opts?.limit);

  const rows = await db<{
    edge_id: string;
    source_id: string;
    counterpart_id: string;
    relationship_type: string;
    relationship_label: LocalizedText;
    inverse_label: LocalizedText | null;
  }[]>`
    select l.id as edge_id, l.source_id,
      (case when l.source_id = ${nodeId} then l.target_id else l.source_id end) as counterpart_id,
      l.relationship_type, rt.label as relationship_label, rt.inverse_label
    from edges l
    join relationship_types rt on rt.slug = l.relationship_type
    join nodes c on c.id = (case when l.source_id = ${nodeId} then l.target_id else l.source_id end)
    where l.relationship_type is not null
      and (${edgeDirectionPredicate(nodeId, opts?.direction)})
      ${typePred}
      and ${readableNodes(user, 'c')}
    limit ${limit}`;

  const propsByEdgeId = await getEdgeProperties(rows.map((r) => r.edge_id));
  const nodes = await hydrateContentNodes(rows.map((r) => r.counterpart_id));
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const label = labelCache();

  return rows
    .map((r): RelationshipEdge | null => {
      const node = nodeById.get(r.counterpart_id);
      if (!node) return null;
      return {
        edgeId: r.edge_id,
        direction: r.source_id === nodeId ? 'outgoing' : 'incoming',
        relationshipType: r.relationship_type,
        relationshipLabel: label(r.relationship_type, r.relationship_label),
        inverseLabel: hasText(r.inverse_label) ? localize(r.inverse_label, '') : null,
        node,
        properties: propsByEdgeId.get(r.edge_id) ?? [],
      };
    })
    .filter((e): e is RelationshipEdge => e != null);
}

// The relationships in a node page's header: edges with a readable counterpart,
// grouped by type and direction, labelled from the node's side. Untyped edges
// count incoming only; `membership` edges are the node's body, so they count
// only incoming from a collection.

/** How many counterparts a group lists. */
const RELATIONSHIP_GROUP_SIZE = 10;

export async function relationshipGroups(
  user: SessionUser | null,
  nodeId: string,
  opts: { membership?: string; size?: number } = {}
): Promise<RelationshipGroupView[]> {
  const membership = opts.membership ?? null;
  const size = Math.min(Math.max(opts.size ?? RELATIONSHIP_GROUP_SIZE, 1), 50);
  const rows = await db<{
    relationship_type: string | null;
    direction: 'outgoing' | 'incoming';
    id: string;
    type: NodeType;
    slug: string;
    namespace_slug: string | null;
    title: string;
    total: number;
  }[]>`
    select relationship_type, direction, id, type, slug, namespace_slug, title, total from (
      select e.*,
        count(*) over (partition by e.relationship_type, e.direction)::int as total,
        row_number() over (partition by e.relationship_type, e.direction order by lower(e.title), e.id) as rank
      from (
        select l.relationship_type,
          case when l.source_id = ${nodeId} then 'outgoing' else 'incoming' end as direction,
          c.id, c.type, c.slug, ${db.unsafe(namespaceSlugColumn())}, c.title
        from edges l
        join nodes c on c.id = (case when l.source_id = ${nodeId} then l.target_id else l.source_id end)
        ${db.unsafe(namespaceJoin('c'))}
        where (l.source_id = ${nodeId} or l.target_id = ${nodeId})
          and ${readableNodes(user, 'c')}
          and (l.relationship_type is not null or l.target_id = ${nodeId})
          and (${membership}::text is null or l.relationship_type is distinct from ${membership}
            or (l.target_id = ${nodeId} and c.type = 'collection'))
      ) e
    ) ranked
    where rank <= ${size}
    order by relationship_type nulls last, direction desc, rank`;
  if (rows.length === 0) return [];

  const types = [...new Set(rows.map((r) => r.relationship_type).filter((t): t is string => t !== null))];
  const labels = types.length
    ? await db<{ slug: string; label: LocalizedText; inverse_label: LocalizedText | null }[]>`
        select slug, label, inverse_label from relationship_types where slug in ${db(types)}`
    : [];
  const label = labelCache();
  const bySlug = new Map(labels.map((t) => [t.slug, t]));
  const groupLabel = (type: string | null, direction: 'outgoing' | 'incoming'): string => {
    if (type === null) return m.node_referenced_by();
    const row = bySlug.get(type);
    const name = row ? label(type, row.label) : type;
    if (direction === 'outgoing') return name;
    return row && hasText(row.inverse_label) ? localize(row.inverse_label, name) : m.node_relationship_incoming({ label: name });
  };

  const groups = new Map<string, RelationshipGroupView>();
  for (const r of rows) {
    const key = `${r.relationship_type ?? ''}:${r.direction}`;
    let group = groups.get(key);
    if (!group) {
      group = { key, relationshipType: r.relationship_type, direction: r.direction, label: groupLabel(r.relationship_type, r.direction), total: r.total, nodes: [] };
      groups.set(key, group);
    }
    group.nodes.push({ id: r.id, type: r.type, title: r.title, href: nodePath(r.namespace_slug, r.slug) });
  }
  // Typed groups by their words, the untyped edges last.
  return [...groups.values()].sort((a, b) => (a.relationshipType === null ? 1 : 0) - (b.relationshipType === null ? 1 : 0) || a.label.localeCompare(b.label));
}
