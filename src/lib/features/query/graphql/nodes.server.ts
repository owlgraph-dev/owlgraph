// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { GraphQLError } from 'graphql';
import type { SessionUser } from '$lib/features/auth/server';
import { getPropertyDatatypes } from '$lib/features/semantic/server';
import { findPagesByFilter, findNodesByFilter, countNodesByFilter, type NodeFilterRow } from '../filterSql.server';
import { getExistingRelationshipTypeSlugs } from '$lib/features/semantic/server';
import {
  validateFilterShape,
  validateFilterOperators,
  collectPropertyNames,
  collectEdgeTypes,
  fromWireFilter,
  fromWireOrderBy,
  type NodeFilterInput,
  type OrderByInput,
  type WireNodeFilter,
  type WireOrderByInput
} from '../nodeFilter';
import { clampFirst, clampOffset } from '$lib/platform/pagination';
import { nodePath, type NodeType } from '$lib/features/nodes';

export interface ContentNodeHit {
  id: string;
  // Always 'page' from getNodes; any type from listNodes.
  type: NodeType;
  title: string;
  url: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
  namespaceId: string;
  createdBy: string | null;
  // Never absent: a node with no domain class carries its node type's ("Page").
  classId: string;
  className: string;
  // A link document's address; null for any other node.
  externalUrl: string | null;
  // The content language (docs/architecture/languages.md).
  locale: string;
}

export interface NodesArgs {
  filter: NodeFilterInput;
  first?: number | null;
  offset?: number | null;
  orderBy?: OrderByInput | null;
}

/**
 * The cost guards every filter passes before any DB work (nodeFilter.ts), and a
 * edge condition must name an existing relationship type. Returns the datatypes
 * the SQL needs; throws a BAD_USER_INPUT GraphQLError on an invalid filter.
 */
async function prepareFilter(filter: NodeFilterInput | null, orderBy: OrderByInput | 'relevance' | null | undefined): Promise<Map<string, string>> {
  if (filter) validateFilterShape(filter);
  const names = filter ? collectPropertyNames(filter) : new Set<string>();
  if (orderBy && orderBy !== 'relevance' && orderBy.kind !== 'intrinsic') names.add(orderBy.name);
  const datatypes = await getPropertyDatatypes([...names]);
  if (!filter) return datatypes;
  validateFilterOperators(filter, datatypes);

  const edgeTypes = [...collectEdgeTypes(filter)];
  if (edgeTypes.length) {
    const valid = await getExistingRelationshipTypeSlugs(edgeTypes);
    const unknown = edgeTypes.find((t) => !valid.has(t));
    if (unknown) throw new GraphQLError(`unknown relationship type "${unknown}"`, { extensions: { code: 'BAD_USER_INPUT' } });
  }
  return datatypes;
}

function toContentNodeHit(n: NodeFilterRow): ContentNodeHit {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    url: nodePath(n.namespace_slug, n.slug),
    slug: n.slug,
    createdAt: n.created_at.toISOString(),
    updatedAt: n.updated_at.toISOString(),
    namespaceId: n.namespace_id,
    createdBy: n.created_by,
    classId: n.class_id,
    className: n.class_name,
    externalUrl: n.external_url,
    locale: n.locale,
  };
}

/**
 * Pages matching a filter that `user` may read. The visibility predicate is in
 * findPagesByFilter's SQL, outside the filter tree, so no filter shape bypasses it.
 */
export async function getNodes(user: SessionUser | null, args: NodesArgs): Promise<ContentNodeHit[]> {
  const datatypes = await prepareFilter(args.filter, args.orderBy);
  const first = clampFirst(args.first);
  const offset = clampOffset(args.offset);
  const rows = await findPagesByFilter(user, args.filter, datatypes, { first, offset, orderBy: args.orderBy });
  return rows.map(toContentNodeHit);
}

export interface ListNodesArgs {
  /** Wire format, as a query block stores it; null lists everything the user may read. */
  filter: WireNodeFilter | null;
  /** 'relevance' to `text`, the default without one; null: most recently updated first. */
  orderBy: WireOrderByInput | 'relevance' | null;
  /** Matched like the search overlay (ftsSql.server.ts). */
  text?: string | null;
  first: number;
  offset: number;
}

export interface ListNodeHit extends ContentNodeHit {
  /** HL_START/HL_STOP-highlighted excerpt; '' without a term or body text. */
  snippet: string;
}

/**
 * The /search page's list: nodes of every type, a page of them and the total,
 * both after the visibility predicate, so the total never counts a node the
 * user can't read. Throws a BAD_USER_INPUT GraphQLError on an invalid filter.
 */
export async function listNodes(user: SessionUser | null, args: ListNodesArgs): Promise<{ items: ListNodeHit[]; total: number }> {
  const filter = args.filter ? fromWireFilter(args.filter) : null;
  const text = args.text?.trim() || null;
  const orderBy = args.orderBy === 'relevance' ? (text ? 'relevance' : null) : fromWireOrderBy(args.orderBy);
  const datatypes = await prepareFilter(filter, orderBy);
  const first = clampFirst(args.first);
  const offset = clampOffset(args.offset);
  const [rows, total] = await Promise.all([
    findNodesByFilter(user, filter, datatypes, { first, offset, orderBy, scope: 'node', text }),
    countNodesByFilter(user, filter, datatypes, { scope: 'node', text }),
  ]);
  return { items: rows.map((r) => ({ ...toContentNodeHit(r), snippet: r.snippet })), total };
}

/** listNodes' total without the rows, for the filter sheet's pending count. */
export async function countNodes(user: SessionUser | null, args: { filter: WireNodeFilter | null; text?: string | null }): Promise<number> {
  const filter = args.filter ? fromWireFilter(args.filter) : null;
  const text = args.text?.trim() || null;
  const datatypes = await prepareFilter(filter, null);
  return countNodesByFilter(user, filter, datatypes, { scope: 'node', text });
}
