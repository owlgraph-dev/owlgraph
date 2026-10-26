// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// One hop at a time in TS, not one recursive query: per-step edge types,
// directions and repeats would need SQL assembled at runtime. Every hop runs
// through runOneHop(), so readableNodes applies at every step and repeat.
import type postgres from 'postgres';
import { logEvent, logger, timed } from '$lib/platform/logger.server';
import { db } from '$lib/platform/db.server';
import { labelCache, type LocalizedText } from '$lib/platform/i18n/localizedText';
import type { SessionUser } from '$lib/features/auth/server';
import { readableNodes, namespaceJoin, namespaceSlugColumn } from '$lib/features/nodes/server';
import { filterFragment, edgePropertyPredicate } from './filterSql.server';
import type { EdgeConditionInput, EdgeDirection, NodeFilterInput } from './nodeFilter';
import type { TraversalStartInput, TraversalStepInput, TraversalQueryInput } from './traversal';
import { MAX_HOP_CANDIDATES, MAX_STEP_ACCUMULATED, MAX_START_NODE_IDS } from './traversal';
import { nodePath, type NodeType } from '$lib/features/nodes';

// No result returns these yet; runOneHop keeps them for a path result.
export interface WalkedEdge {
  edgeId: string;
  sourceId: string; // the frontier-side endpoint this hop walked from
  targetId: string; // the candidate discovered
}

function hopDirectionPredicate(direction: EdgeDirection, frontierIds: string[]): postgres.Fragment {
  if (direction === 'outgoing') return db`l.source_id = any(${frontierIds}::uuid[])`;
  if (direction === 'incoming') return db`l.target_id = any(${frontierIds}::uuid[])`;
  return db`(l.source_id = any(${frontierIds}::uuid[]) or l.target_id = any(${frontierIds}::uuid[]))`;
}

// No target filter here: a repeated step walks on through non-matching nodes.
// A node the viewer can't read is dropped, indistinguishable from no edge.
// Excluding `visited`, the whole walk's, makes a cyclic edge type safe.
async function runOneHop(
  user: SessionUser | null,
  frontierIds: string[],
  edge: EdgeConditionInput,
  datatypes: Map<string, string>,
  visited: Set<string>
): Promise<{ candidateIds: string[]; walkedEdges: WalkedEdge[] }> {
  if (frontierIds.length === 0) return { candidateIds: [], walkedEdges: [] };
  const dirPred = hopDirectionPredicate(edge.direction, frontierIds);
  const propPred = edge.property
    ? db`and (${edgePropertyPredicate(edge.property, datatypes.get(edge.property.name) ?? 'text')})`
    : db``;
  const visitedArr = [...visited];

  const rows = await db<{ candidate_id: string; edge_id: string; via_id: string }[]>`
    select distinct on (hop.candidate_id) hop.candidate_id, hop.edge_id, hop.via_id
    from (
      select l.id as edge_id,
        case when l.source_id = any(${frontierIds}::uuid[]) then l.source_id else l.target_id end as via_id,
        case when l.source_id = any(${frontierIds}::uuid[]) then l.target_id else l.source_id end as candidate_id
      from edges l
      where l.relationship_type = ${edge.type} and (${dirPred}) ${propPred}
    ) hop
    join nodes c on c.id = hop.candidate_id
    where not (hop.candidate_id = any(${visitedArr}::uuid[]))
      and ${readableNodes(user, 'c')}
    limit ${MAX_HOP_CANDIDATES + 1}`;

  // Silent to the caller: a `truncated` flag could tell "cost-capped" from
  // "authz-pruned". Only the operator's log learns a cap bit.
  if (rows.length > MAX_HOP_CANDIDATES) {
    logEvent(logger, 'query.limit_hit', {
      limit: 'hop_candidates',
      value: rows.length,
      cap: MAX_HOP_CANDIDATES,
      via: 'page',
    });
  }
  const kept = rows.length > MAX_HOP_CANDIDATES ? rows.slice(0, MAX_HOP_CANDIDATES) : rows;
  return {
    candidateIds: kept.map((r) => r.candidate_id),
    walkedEdges: kept.map((r) => ({ edgeId: r.edge_id, sourceId: r.via_id, targetId: r.candidate_id }))
  };
}

// A separate pass: runOneHop's candidates stay unfiltered for walking on.
async function applyTargetFilter(
  candidateIds: string[],
  targetFilter: NodeFilterInput,
  datatypes: Map<string, string>
): Promise<Set<string>> {
  if (candidateIds.length === 0) return new Set();
  const rows = await db<{ id: string }[]>`
    select n.id from nodes n
    where n.id = any(${candidateIds}::uuid[]) and (${filterFragment(targetFilter, datatypes, 'n')})`;
  return new Set(rows.map((r) => r.id));
}

// Every hop's candidates feed the next hop regardless of the target filter;
// only those passing it, at whatever depth first reached, join the output.
async function runStep(
  user: SessionUser | null,
  walkFrontierIds: string[],
  step: TraversalStepInput,
  datatypes: Map<string, string>,
  visited: Set<string>
): Promise<string[]> {
  let currentWalk = walkFrontierIds;
  const stepOutput = new Set<string>();

  for (let hop = 1; hop <= step.repeat; hop++) {
    if (currentWalk.length === 0 || stepOutput.size >= MAX_STEP_ACCUMULATED) break;

    const { candidateIds } = await runOneHop(user, currentWalk, step.edge, datatypes, visited);
    if (candidateIds.length === 0) break;
    for (const id of candidateIds) visited.add(id);
    currentWalk = candidateIds;

    const passing = step.targetFilter ? await applyTargetFilter(candidateIds, step.targetFilter, datatypes) : new Set(candidateIds);
    for (const id of passing) {
      if (stepOutput.size >= MAX_STEP_ACCUMULATED) {
        logEvent(logger, 'query.limit_hit', {
          limit: 'step_accumulated',
          value: stepOutput.size + 1,
          cap: MAX_STEP_ACCUMULATED,
          via: 'page',
        });
        break;
      }
      stepOutput.add(id);
    }
  }

  return [...stepOutput];
}

// A given id the viewer can't read is dropped, indistinguishable from a missing one.
async function resolveStartIds(
  user: SessionUser | null,
  start: TraversalStartInput,
  datatypes: Map<string, string>
): Promise<string[]> {
  if (start.nodeIds) {
    if (start.nodeIds.length === 0) return [];
    const rows = await db<{ id: string }[]>`
      select n.id from nodes n
      where n.id = any(${start.nodeIds}::uuid[]) and ${readableNodes(user, 'n')}`;
    return rows.map((r) => r.id);
  }
  const rows = await db<{ id: string }[]>`
    select n.id from nodes n
    where (${filterFragment(start.filter!, datatypes, 'n')}) and ${readableNodes(user, 'n')}
    limit ${MAX_START_NODE_IDS}`;
  if (rows.length >= MAX_START_NODE_IDS) {
    logEvent(logger, 'query.limit_hit', {
      limit: 'start_nodes',
      value: rows.length,
      cap: MAX_START_NODE_IDS,
      via: 'page',
    });
  }
  return rows.map((r) => r.id);
}

// One `visited` set across the whole traversal, so a cycle spanning steps is
// safe too. Timed under a label, never SQL text or parameters (docs/architecture/logging.md,
// "Performance and limits").
export function traverseNodes(...args: Parameters<typeof traverseNodesImpl>): ReturnType<typeof traverseNodesImpl> {
  return timed('traversal.traverse', () => traverseNodesImpl(...args)) as ReturnType<typeof traverseNodesImpl>;
}

async function traverseNodesImpl(
  user: SessionUser | null,
  query: TraversalQueryInput,
  datatypes: Map<string, string>
): Promise<string[]> {
  let frontier = await resolveStartIds(user, query.start, datatypes);
  const visited = new Set(frontier);
  for (const step of query.steps) {
    if (frontier.length === 0) break;
    frontier = await runStep(user, frontier, step, datatypes, visited);
  }
  return frontier;
}

export interface TraversalNodeHit {
  id: string;
  type: NodeType;
  title: string;
  url: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
  namespaceId: string;
  createdBy: string | null;
  classId: string;
  className: string;
  // A link document's address; null for any other node.
  externalUrl: string | null;
  // The content language (docs/architecture/languages.md).
  locale: string;
}

// No authz check here: pass only ids that already passed readableNodes.
export function hydrateContentNodes(...args: Parameters<typeof hydrateContentNodesImpl>): ReturnType<typeof hydrateContentNodesImpl> {
  return timed('traversal.hydrate', () => hydrateContentNodesImpl(...args)) as ReturnType<typeof hydrateContentNodesImpl>;
}

async function hydrateContentNodesImpl(ids: string[]): Promise<TraversalNodeHit[]> {
  if (ids.length === 0) return [];
  const rows = await db<
    { id: string; type: NodeType; slug: string; namespace_slug: string | null; title: string; created_at: Date; updated_at: Date; namespace_id: string; created_by: string | null; class_id: string; class_slug: string; class_label: LocalizedText; external_url: string | null; locale: string }[]
  >`
    select n.id, n.type, n.slug, ${db.unsafe(namespaceSlugColumn())}, n.title, n.created_at, n.updated_at, n.namespace_id, n.created_by,
           n.class_id, nc.slug as class_slug, nc.label as class_label, d.external_url, n.locale
    from nodes n ${db.unsafe(namespaceJoin('n'))}
    join node_classes nc on nc.id = n.class_id
    left join documents d on d.id = n.id
    where n.id = any(${ids}::uuid[])`;
  const byId = new Map(rows.map((r) => [r.id, r]));
  const label = labelCache();
  // In discovery order, not the query's.
  return ids
    .map((id) => byId.get(id))
    .filter((r): r is NonNullable<typeof r> => r != null)
    .map((r) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      url: nodePath(r.namespace_slug, r.slug),
      slug: r.slug,
      createdAt: r.created_at.toISOString(),
      updatedAt: r.updated_at.toISOString(),
      namespaceId: r.namespace_id,
      createdBy: r.created_by,
      classId: r.class_id,
      className: label(r.class_slug, r.class_label),
      externalUrl: r.external_url,
      locale: r.locale
    }));
}
