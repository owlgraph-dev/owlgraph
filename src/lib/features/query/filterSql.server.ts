// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Compiles a NodeFilter tree into a boolean SQL fragment, and the list query
// built on it. Callers must have run validateFilterShape and
// validateFilterOperators (nodeFilter.ts): the tree is assumed valid here.
import type postgres from 'postgres';
import { timed } from '$lib/platform/logger.server';
import { db } from '$lib/platform/db.server';
import { labelCache, type LocalizedText } from '$lib/platform/i18n/localizedText';
import type { SessionUser } from '$lib/features/auth/server';
import { readableNodes, namespaceJoin, namespaceSlugColumn } from '$lib/features/nodes/server';
import { collectionHeadline, containsSnippet, documentHeadline, ftsMatches, ftsMatchingIds, ftsRank, memberTitleHeadline, memberTitleMatches, pageHeadline } from '$lib/features/search/server';
import {
  INTRINSIC_FIELD_CATEGORY,
  type NodeFilterInput,
  type PropertyConditionInput,
  type EdgeConditionInput,
  type OrderByInput,
  type IntrinsicConditionInput,
  type IntrinsicField,
  type TagConditionInput,
} from './nodeFilter';
import type { NodeType } from '$lib/features/nodes';

function castLiteral(v: string, datatype: string): string | number | Date {
  if (datatype === 'number') return Number(v); // format validated in nodeFilter.ts
  if (datatype === 'date') return new Date(v);
  return v;
}

// A correlated EXISTS per leaf, so several conditions on one property combine,
// which a JOIN can't. prop_safe_numeric/prop_safe_date drop a non-conforming
// stored value from the comparison instead of failing the query.
// `alias` goes into SQL unguarded: a literal in the calling code, never request
// input. Required, not defaulted: a forgotten alias would compile and silently
// match nothing.
function leafFragment(cond: PropertyConditionInput, datatype: string, alias: string): postgres.Fragment {
  const row = db.unsafe(`${alias}.id`);
  // A name prefix ("core:" selects a whole group), never a value comparison.
  if (cond.operator === 'startsWith') {
    return db`exists (select 1 from node_properties pp where pp.node_id = ${row} and position(${cond.name} in pp.name) = 1)`;
  }

  const col =
    datatype === 'number'
      ? db`prop_safe_numeric(pp.value)`
      : datatype === 'date'
        ? db`prop_safe_date(pp.value)`
        : db`pp.value`;

  let pred = db``;
  switch (cond.operator) {
    case 'exists':
    case 'notExists':
      break;
    case 'eq':
      pred = db`and ${col} = ${castLiteral(cond.value!, datatype)}`;
      break;
    case 'neq':
      pred = db`and ${col} <> ${castLiteral(cond.value!, datatype)}`;
      break;
    case 'gt':
      pred = db`and ${col} > ${castLiteral(cond.value!, datatype)}`;
      break;
    case 'gte':
      pred = db`and ${col} >= ${castLiteral(cond.value!, datatype)}`;
      break;
    case 'lt':
      pred = db`and ${col} < ${castLiteral(cond.value!, datatype)}`;
      break;
    case 'lte':
      pred = db`and ${col} <= ${castLiteral(cond.value!, datatype)}`;
      break;
    case 'contains':
      // position() needs no escaping of LIKE's % and _.
      pred = db`and position(lower(${cond.value!}) in lower(pp.value)) > 0`;
      break;
    case 'in':
      pred = db`and ${col} in ${db(cond.values!.map((v) => castLiteral(v, datatype)))}`;
      break;
  }

  const exists = db`exists (select 1 from node_properties pp where pp.node_id = ${row} and pp.name = ${cond.name} ${pred})`;
  return cond.operator === 'notExists' ? db`not ${exists}` : exists;
}

// leafFragment against edge_properties. Always on the edge alias `l`, which
// every caller (edgeLeafFragment, traversal.server.ts's hop) joins edges as.
export function edgePropertyPredicate(cond: PropertyConditionInput, datatype: string): postgres.Fragment {
  if (cond.operator === 'startsWith') {
    return db`exists (select 1 from edge_properties lp where lp.edge_id = l.id and position(${cond.name} in lp.name) = 1)`;
  }

  const col =
    datatype === 'number'
      ? db`prop_safe_numeric(lp.value)`
      : datatype === 'date'
        ? db`prop_safe_date(lp.value)`
        : db`lp.value`;

  let pred = db``;
  switch (cond.operator) {
    case 'exists':
    case 'notExists':
      break;
    case 'eq':
      pred = db`and ${col} = ${castLiteral(cond.value!, datatype)}`;
      break;
    case 'neq':
      pred = db`and ${col} <> ${castLiteral(cond.value!, datatype)}`;
      break;
    case 'gt':
      pred = db`and ${col} > ${castLiteral(cond.value!, datatype)}`;
      break;
    case 'gte':
      pred = db`and ${col} >= ${castLiteral(cond.value!, datatype)}`;
      break;
    case 'lt':
      pred = db`and ${col} < ${castLiteral(cond.value!, datatype)}`;
      break;
    case 'lte':
      pred = db`and ${col} <= ${castLiteral(cond.value!, datatype)}`;
      break;
    case 'contains':
      pred = db`and position(lower(${cond.value!}) in lower(lp.value)) > 0`;
      break;
    case 'in':
      pred = db`and ${col} in ${db(cond.values!.map((v) => castLiteral(v, datatype)))}`;
      break;
  }

  const exists = db`exists (select 1 from edge_properties lp where lp.edge_id = l.id and lp.name = ${cond.name} ${pred})`;
  return cond.operator === 'notExists' ? db`not ${exists}` : exists;
}

function edgeLeafFragment(cond: EdgeConditionInput, datatypes: Map<string, string>, alias: string): postgres.Fragment {
  const row = db.unsafe(`${alias}.id`);
  const dirPred =
    cond.direction === 'outgoing'
      ? db`l.source_id = ${row}`
      : cond.direction === 'incoming'
        ? db`l.target_id = ${row}`
        : db`(l.source_id = ${row} or l.target_id = ${row})`;
  const propertyPred = cond.property ? db`and (${edgePropertyPredicate(cond.property, datatypes.get(cond.property.name) ?? 'text')})` : db``;
  return db`exists (select 1 from edges l where ${dirPred} and l.relationship_type = ${cond.type} ${propertyPred})`;
}

// A fixed whitelist, read into SQL unquoted; values are always parameters.
const INTRINSIC_EXPR: Record<IntrinsicField, string> = {
  slug: 'n.slug',
  title: 'n.title',
  createdAt: 'n.created_at',
  updatedAt: 'n.updated_at',
  type: 'n.type',
  namespaceId: 'n.namespace_id',
  createdBy: 'n.created_by',
  classId: 'n.class_id',
  externalUrl: '(select d.external_url from documents d where d.id = n.id)',
  locale: 'n.locale',
};

function castIntrinsicLiteral(field: IntrinsicField, v: string): string | Date {
  return INTRINSIC_FIELD_CATEGORY[field] === 'date' ? new Date(v) : v;
}

// Each class and all its subclasses. node_classes is tiny and indexed on
// parent_id, so walking it is cheap and always exact, with no cache to go stale;
// `union`, not `union all`, terminates even on a cycle.
function classSubtreeFragment(ids: string[]): postgres.Fragment {
  return db`(
    with recursive down as (
      select id from node_classes where id = any(${ids}::uuid[])
      union
      select c.id from node_classes c join down on c.parent_id = down.id
    )
    select id from down
  )`;
}

// Reads the alias `n` whatever filterFragment's alias: every caller selects
// `from nodes n`. A class is "is a X", X or a subclass, unless classMatch is
// 'exact'. externalUrl is the one nullable field, so its neq is null-safe.
function intrinsicLeafFragment(cond: IntrinsicConditionInput): postgres.Fragment {
  const col = db.unsafe(INTRINSIC_EXPR[cond.field]);
  if (INTRINSIC_FIELD_CATEGORY[cond.field] === 'class' && cond.classMatch !== 'exact') {
    const subtree = classSubtreeFragment(cond.operator === 'in' ? cond.values! : [cond.value!]);
    return cond.operator === 'neq' ? db`${col} not in ${subtree}` : db`${col} in ${subtree}`;
  }
  switch (cond.operator) {
    case 'exists':
      return db`${col} is not null`;
    case 'notExists':
      return db`${col} is null`;
    case 'eq':
      return db`${col} = ${castIntrinsicLiteral(cond.field, cond.value!)}`;
    case 'neq':
      return db`${col} is distinct from ${castIntrinsicLiteral(cond.field, cond.value!)}`;
    case 'gt':
      return db`${col} > ${castIntrinsicLiteral(cond.field, cond.value!)}`;
    case 'gte':
      return db`${col} >= ${castIntrinsicLiteral(cond.field, cond.value!)}`;
    case 'lt':
      return db`${col} < ${castIntrinsicLiteral(cond.field, cond.value!)}`;
    case 'lte':
      return db`${col} <= ${castIntrinsicLiteral(cond.field, cond.value!)}`;
    case 'contains':
      return db`position(lower(${cond.value!}) in lower(${col})) > 0`;
    case 'startsWith':
      // A value prefix, unlike a property's name-prefix startsWith.
      return db`position(lower(${cond.value!}) in lower(${col})) = 1`;
    case 'in':
      return db`${col} in ${db(cond.values!.map((v) => castIntrinsicLiteral(cond.field, v)))}`;
    default:
      // Unreachable after validateIntrinsicCondition (nodeFilter.ts).
      throw new Error(`unsupported intrinsic operator "${cond.operator}"`);
  }
}

// Correlated on node_id first, the primary key's lead, so lower() runs over one
// node's rows and needs no expression index. Values are deduplicated lowercased,
// so `hasAll` counts distinct requirements (['Foo','foo'] is one).
function tagLeafFragment(cond: TagConditionInput, alias: string): postgres.Fragment {
  const row = db.unsafe(`${alias}.id`);
  if (cond.operator === 'has') {
    return db`exists (select 1 from node_tags t where t.node_id = ${row} and lower(t.tag) = lower(${cond.value!.trim()}))`;
  }
  const lowered = [...new Set(cond.values!.map((v) => v.trim().toLowerCase()))];
  const any = db`exists (select 1 from node_tags t where t.node_id = ${row} and lower(t.tag) = any(${lowered}::text[]))`;
  switch (cond.operator) {
    case 'hasAny':
      return any;
    case 'hasNone':
      return db`not ${any}`;
    case 'hasAll':
      return db`(select count(distinct lower(t.tag)) from node_tags t where t.node_id = ${row} and lower(t.tag) = any(${lowered}::text[])) = ${lowered.length}`;
    default:
      // Unreachable after validateTagCondition (nodeFilter.ts).
      throw new Error(`unsupported tag operator "${cond.operator}"`);
  }
}

// Every child is wrapped in parens, the first included: AND binds tighter than
// OR and would silently change what a nested tree matches.
export function filterFragment(node: NodeFilterInput, datatypes: Map<string, string>, alias: string): postgres.Fragment {
  if (node.property) return leafFragment(node.property, datatypes.get(node.property.name) ?? 'text', alias);
  if (node.edge) return edgeLeafFragment(node.edge, datatypes, alias);
  if (node.intrinsic) return intrinsicLeafFragment(node.intrinsic);
  if (node.tag) return tagLeafFragment(node.tag, alias);
  const glue = node.and ? db`and` : db`or`;
  const kids = (node.and ?? node.or)!.map((c) => db`(${filterFragment(c, datatypes, alias)})`);
  return kids.reduce((acc, frag) => db`${acc} ${glue} ${frag}`);
}

// A property sorts by its safe-cast value, NULLs last either way, so unset
// values don't crowd either end. updated_at desc, then the id, break every
// tie, so offset paging neither skips nor repeats a row.
function orderByFragment(orderBy: ListOrder, datatype: string): postgres.Fragment {
  const ties = db`n.updated_at desc, n.id`;
  if (!orderBy) return ties;
  if (orderBy === 'relevance') return db`rank desc, ${ties}`;
  const dir = orderBy.direction === 'asc' ? db`asc` : db`desc`;
  if (orderBy.kind === 'intrinsic') {
    const col = db.unsafe(INTRINSIC_EXPR[orderBy.name as IntrinsicField]);
    return db`${col} ${dir}, ${ties}`;
  }
  const valueExpr =
    datatype === 'number'
      ? db`prop_safe_numeric(pp.value)`
      : datatype === 'date'
        ? db`prop_safe_date(pp.value)`
        : db`pp.value`;
  return db`(select ${valueExpr} from node_properties pp where pp.node_id = n.id and pp.name = ${orderBy.name} limit 1) ${dir} nulls last, ${ties}`;
}

/** How a list is ordered: a field or property, by relevance to the
 * full-text term, or (null) most recently updated first. */
export type ListOrder = OrderByInput | 'relevance' | null | undefined;

/** Which nodes a list covers: pages only (the GraphQL `nodes` query and
 * query blocks), or every node type (the /search page). */
export type NodeScope = 'page' | 'node';

export interface NodeFilterRow {
  id: string;
  slug: string;
  namespace_slug: string | null;
  title: string;
  // A Date, as postgres.js returns it: convert to an ISO string before it
  // reaches a hit type, never pass one to esc() or templateBinding.ts.
  created_at: Date;
  updated_at: Date;
  type: NodeType;
  namespace_id: string;
  created_by: string | null;
  class_id: string;
  // The class label in the request's locale, or its slug when untranslated.
  class_name: string;
  locale: string; // the content language (nodes.locale)
  external_url: string | null; // a link document's address; null otherwise
  // HL_START/HL_STOP-highlighted excerpt around the term's match; '' without one.
  snippet: string;
}

export interface FindNodesOpts {
  first: number;
  offset: number;
  orderBy?: ListOrder;
  scope: NodeScope;
  /** A full-text term the nodes must match (the search overlay's matching,
   * ftsSql.server.ts); it also yields each row's rank and excerpt. */
  text?: string | null;
}

// Shared by the rows and their count, so the two always agree. The visibility
// predicate is ANDed at the outermost level and built from `user` alone; the
// filter tree sits in its own parens, so no filter shape or term can bypass it.
function listFromWhere(
  user: SessionUser | null,
  filter: NodeFilterInput | null,
  datatypes: Map<string, string>,
  opts: Pick<FindNodesOpts, 'scope' | 'text'>
): postgres.Fragment {
  const tree = filter ? filterFragment(filter, datatypes, 'n') : db`true`;
  const scope = opts.scope === 'page' ? db`p.id is not null` : db`true`;
  // Over every node type, a collection is found by a member's title too, for this viewer (memberTitleMatches).
  const text = !opts.text
    ? db`true`
    : opts.scope === 'node'
      ? db`(n.id in ${ftsMatchingIds(opts.text)} or n.id in ${memberTitleMatches(user, opts.text)})`
      : db`n.id in ${ftsMatchingIds(opts.text)}`;
  const documents = opts.scope === 'node' ? db`left join documents d on d.id = n.id left join collections cl on cl.id = n.id` : db``;
  return db`
    from nodes n left join pages p on p.id = n.id ${documents} ${db.unsafe(namespaceJoin('n'))}
    join node_classes nc on nc.id = n.class_id
    where ${scope} and (${tree}) and ${text} and ${readableNodes(user, 'n')}`;
}

// ts_headline sits in the select list: Postgres evaluates a costly output column
// after the sort and the limit, so only the returned rows are excerpted.
function textColumns(user: SessionUser | null, scope: NodeScope, text: string | null | undefined): postgres.Fragment {
  if (!text) return db`0::real as rank, ''::text as snippet, ''::text as member_snippet`;
  if (scope === 'page') return db`${ftsRank('p', text)} as rank, ${pageHeadline('p', text)} as snippet, ''::text as member_snippet`;
  // A collection that does not match itself was found by a member's title: that title is its excerpt.
  return db`coalesce(${ftsRank('p', text)}, ${ftsRank('d', text)}, ${ftsRank('cl', text)}) as rank,
    case when p.id is not null then ${pageHeadline('p', text)} when d.id is not null then ${documentHeadline('d', text)}
      when ${ftsMatches('cl', text)} then ${collectionHeadline('cl', text)} else '' end as snippet,
    case when cl.id is not null and not (${ftsMatches('cl', text)}) then ${memberTitleHeadline('n', user, text)} else '' end as member_snippet`;
}

// Timed under a label (docs/architecture/logging.md, "Performance and limits"), never SQL
// text or parameters: those carry token hashes and whole documents.
export function findNodesByFilter(...args: Parameters<typeof findNodesByFilterImpl>): ReturnType<typeof findNodesByFilterImpl> {
  const label = args[3].scope === 'page' ? 'query.filter' : 'query.list';
  return timed(label, () => findNodesByFilterImpl(...args)) as ReturnType<typeof findNodesByFilterImpl>;
}

async function findNodesByFilterImpl(
  user: SessionUser | null,
  filter: NodeFilterInput | null,
  datatypes: Map<string, string>,
  opts: FindNodesOpts
): Promise<NodeFilterRow[]> {
  const orderBy = opts.orderBy === 'relevance' && !opts.text ? null : opts.orderBy;
  const sortDatatype = orderBy && orderBy !== 'relevance' && orderBy.kind !== 'intrinsic' ? (datatypes.get(orderBy.name) ?? 'text') : 'text';
  const externalUrl = opts.scope === 'node' ? db`d.external_url` : db`null::text as external_url`;
  const rows = await db<(Omit<NodeFilterRow, 'class_name'> & { class_slug: string; class_label: LocalizedText; member_snippet: string })[]>`
    select n.id, n.slug, ${db.unsafe(namespaceSlugColumn())}, n.title, n.created_at, n.updated_at, n.type, n.namespace_id, n.created_by,
           n.class_id, nc.slug as class_slug, nc.label as class_label, n.locale, ${externalUrl}, ${textColumns(user, opts.scope, opts.text)}
    ${listFromWhere(user, filter, datatypes, opts)}
    order by ${orderByFragment(orderBy, sortDatatype)} limit ${opts.first} offset ${opts.offset}`;
  const label = labelCache();
  return rows.map(({ class_slug, class_label, member_snippet, ...r }) => ({
    ...r,
    snippet: r.snippet || containsSnippet(member_snippet),
    class_name: label(class_slug, class_label),
  }));
}

// The total behind a paged list, under the same visibility predicate as the rows.
export function countNodesByFilter(...args: Parameters<typeof countNodesByFilterImpl>): ReturnType<typeof countNodesByFilterImpl> {
  return timed('query.count', () => countNodesByFilterImpl(...args)) as ReturnType<typeof countNodesByFilterImpl>;
}

async function countNodesByFilterImpl(
  user: SessionUser | null,
  filter: NodeFilterInput | null,
  datatypes: Map<string, string>,
  opts: Pick<FindNodesOpts, 'scope' | 'text'>
): Promise<number> {
  const [row] = await db<{ total: number }[]>`select count(*)::int as total ${listFromWhere(user, filter, datatypes, opts)}`;
  return row.total;
}

// What the GraphQL `nodes` query and query blocks list.
export function findPagesByFilter(
  user: SessionUser | null,
  filter: NodeFilterInput,
  datatypes: Map<string, string>,
  opts: { first: number; offset: number; orderBy?: OrderByInput | null }
): Promise<NodeFilterRow[]> {
  return findNodesByFilter(user, filter, datatypes, { ...opts, scope: 'page' });
}
