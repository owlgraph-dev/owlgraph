// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Pure validation of the `nodes` filter tree. GraphQL has no "exactly one of"
// input, so the union shape is enforced here. The tree's recursion lives inside
// one argument's value, where a document-depth validator never looks, so the
// depth and leaf caps below are the only guard and must run before any DB work.
import { GraphQLError } from 'graphql';
import { isSupportedLocale } from '$lib/platform/i18n/siteLocales';
import { NODE_TYPES } from '$lib/features/nodes';

export type PropertyOperator =
  | 'eq'
  | 'neq'
  | 'contains'
  | 'exists'
  | 'notExists'
  | 'in'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'startsWith';

export interface PropertyConditionInput {
  name: string;
  operator: PropertyOperator;
  value?: string | null;
  values?: string[] | null;
}

// A typed-edge condition: `type` is a relationship type slug; `property`, when
// set, conditions on the edge's own edge_properties.
export type EdgeDirection = 'outgoing' | 'incoming' | 'either';

export interface EdgeConditionInput {
  type: string;
  direction: EdgeDirection;
  property?: PropertyConditionInput | null;
}

// A field of the node itself, filtered against its column rather than
// node_properties (filterSql.server.ts). type is the class's nearest node-type
// slug; externalUrl, a link document's address, is no nodes column and the one
// field that can be absent; locale is the content's language (docs/architecture/languages.md).
export type IntrinsicField = 'slug' | 'title' | 'createdAt' | 'updatedAt' | 'type' | 'namespaceId' | 'createdBy' | 'classId' | 'externalUrl' | 'locale';

// On classId only: 'isA' (the default) is the class or any subclass, 'exact'
// that class alone (docs/architecture/semantic-layer.md, "Querying by class").
export type ClassMatch = 'isA' | 'exact';

export interface IntrinsicConditionInput {
  field: IntrinsicField;
  operator: PropertyOperator;
  value?: string | null;
  values?: string[] | null;
  classMatch?: ClassMatch | null;
}

// Tags are multi-valued free strings, so the operators are set predicates,
// matched case-insensitively (docs/architecture/semantic-layer.md, "Querying by tag").
export type TagOperator = 'has' | 'hasAny' | 'hasAll' | 'hasNone';

export interface TagConditionInput {
  operator: TagOperator;
  value?: string | null;
  values?: string[] | null;
}

export interface NodeFilterInput {
  property?: PropertyConditionInput | null;
  edge?: EdgeConditionInput | null;
  intrinsic?: IntrinsicConditionInput | null;
  tag?: TagConditionInput | null;
  and?: NodeFilterInput[] | null;
  or?: NodeFilterInput[] | null;
}

// No exists/notExists on a column field: every column is NOT NULL. externalUrl,
// nullable, is the exception. An intrinsic startsWith is a VALUE prefix; a
// property's startsWith is a NAME prefix selecting a whole property group.
export type IntrinsicFieldCategory = 'text' | 'date' | 'type' | 'namespace' | 'creator' | 'class' | 'externalUrl' | 'locale';

export const INTRINSIC_FIELD_CATEGORY: Record<IntrinsicField, IntrinsicFieldCategory> = {
  slug: 'text',
  title: 'text',
  createdAt: 'date',
  updatedAt: 'date',
  type: 'type',
  namespaceId: 'namespace',
  createdBy: 'creator',
  classId: 'class',
  externalUrl: 'externalUrl',
  locale: 'locale',
};

const INTRINSIC_OPERATORS_BY_CATEGORY: Record<IntrinsicFieldCategory, ReadonlySet<PropertyOperator>> = {
  text: new Set(['eq', 'neq', 'contains', 'in', 'startsWith']),
  date: new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in']),
  type: new Set(['eq', 'neq', 'in']),
  namespace: new Set(['eq', 'neq', 'in']),
  creator: new Set(['eq', 'neq', 'in']),
  // The explicit class (nodes.class_id), never class-implied properties; read
  // as "is a X" (X or a subclass) unless classMatch is 'exact'.
  class: new Set(['eq', 'neq', 'in']),
  externalUrl: new Set(['exists', 'notExists', 'eq', 'neq', 'contains', 'startsWith']),
  // A language code (de, en): a closed set, like a node type.
  locale: new Set(['eq', 'neq', 'in']),
};

function isIntrinsicField(name: string): name is IntrinsicField {
  return Object.hasOwn(INTRINSIC_FIELD_CATEGORY, name);
}

function intrinsicOperatorTakesValue(op: PropertyOperator): boolean {
  return op !== 'exists' && op !== 'notExists';
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NODE_TYPE_VALUES: ReadonlySet<string> = new Set(NODE_TYPES);

// Like validateLeafCondition, against the static category table: no lookup.
export function validateIntrinsicCondition(cond: IntrinsicConditionInput): void {
  const category = INTRINSIC_FIELD_CATEGORY[cond.field];
  const allowed = INTRINSIC_OPERATORS_BY_CATEGORY[category];
  if (!allowed.has(cond.operator)) {
    badInput(`operator "${cond.operator}" is not valid for intrinsic field "${cond.field}"; allowed: ${[...allowed].join(', ')}`);
  }

  if (cond.classMatch != null && category !== 'class') {
    badInput(`"classMatch" only applies to the intrinsic field "classId", not "${cond.field}"`);
  }

  const hasValue = cond.value != null;
  const hasValues = cond.values != null && cond.values.length > 0;
  if (!intrinsicOperatorTakesValue(cond.operator)) {
    if (hasValue || hasValues) badInput(`"${cond.operator}" takes no "value" or "values"`);
    return;
  }
  if (cond.operator === 'in') {
    if (!hasValues || hasValue) badInput('"in" requires "values" (and not "value")');
  } else if (!hasValue || hasValues) {
    badInput(`"${cond.operator}" requires "value" (and not "values")`);
  }

  const literals = cond.operator === 'in' ? cond.values! : [cond.value!];
  if (category === 'date') {
    for (const lit of literals) {
      if (!isValidLiteral(lit, 'date')) badInput(`"${lit}" is not a valid date literal for "${cond.field}" (expected YYYY-MM-DD)`);
    }
  } else if (category === 'namespace' || category === 'creator' || category === 'class') {
    for (const lit of literals) {
      if (!UUID_RE.test(lit)) badInput(`"${lit}" is not a valid id for "${cond.field}"`);
    }
  } else if (category === 'type') {
    for (const lit of literals) {
      if (!NODE_TYPE_VALUES.has(lit)) badInput(`"${lit}" is not a valid node type for "${cond.field}"`);
    }
  } else if (category === 'locale') {
    // Any supported language: a node keeps one that was disabled since.
    for (const lit of literals) {
      if (!isSupportedLocale(lit)) badInput(`"${lit}" is not a supported language for "${cond.field}"`);
    }
  }
}

// Bounds the number of parameters one tag leaf can carry.
const MAX_TAG_VALUES = 50;

export function validateTagCondition(cond: TagConditionInput): void {
  const hasValue = cond.value != null;
  const hasValues = cond.values != null && cond.values.length > 0;
  if (cond.operator === 'has') {
    if (!hasValue || hasValues) badInput('"has" requires "value" (and not "values")');
  } else if (cond.operator === 'hasAny' || cond.operator === 'hasAll' || cond.operator === 'hasNone') {
    if (!hasValues || hasValue) badInput(`"${cond.operator}" requires "values" (and not "value")`);
    if (cond.values!.length > MAX_TAG_VALUES) badInput(`too many tags in one condition (max ${MAX_TAG_VALUES})`);
  } else {
    badInput(`operator "${cond.operator}" is not valid for a tag condition; allowed: has, hasAny, hasAll, hasNone`);
  }
  const literals = cond.operator === 'has' ? [cond.value!] : cond.values!;
  for (const lit of literals) {
    if (typeof lit !== 'string' || !lit.trim()) badInput('a tag condition value must be a non-blank string');
  }
}

// startsWith is on every entry: a name prefix ("core:") selecting a whole
// group, so it doesn't depend on the value's datatype.
const OPERATORS_BY_DATATYPE: Record<string, ReadonlySet<PropertyOperator>> = {
  text: new Set(['eq', 'neq', 'contains', 'exists', 'notExists', 'in', 'startsWith']),
  url: new Set(['eq', 'neq', 'contains', 'exists', 'notExists', 'in', 'startsWith']),
  page: new Set(['eq', 'neq', 'contains', 'exists', 'notExists', 'in', 'startsWith']),
  number: new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'exists', 'notExists', 'in', 'startsWith']),
  date: new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'exists', 'notExists', 'in', 'startsWith']),
  boolean: new Set(['eq', 'neq', 'exists', 'notExists', 'startsWith'])
};

function operatorsFor(datatype: string): ReadonlySet<PropertyOperator> {
  return OPERATORS_BY_DATATYPE[datatype] ?? OPERATORS_BY_DATATYPE.text;
}

export function badInput(message: string): never {
  throw new GraphQLError(message, { extensions: { code: 'BAD_USER_INPUT' } });
}

const NUMERIC_LITERAL_RE = /^-?\d+(\.\d+)?$/;
const DATE_LITERAL_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidLiteral(lit: string, datatype: 'number' | 'date'): boolean {
  if (datatype === 'number') return NUMERIC_LITERAL_RE.test(lit);
  // The regex accepts "2024-13-45"; the literal must also parse.
  return DATE_LITERAL_RE.test(lit) && !isNaN(new Date(lit).getTime());
}

// Throws a GraphQLError, never a plain Error: graphql-yoga masks any other
// error outside dev mode.
export function validateLeafCondition(cond: PropertyConditionInput, datatype: string): void {
  const allowed = operatorsFor(datatype);
  if (!allowed.has(cond.operator)) {
    badInput(
      `operator "${cond.operator}" is not valid for property "${cond.name}" (datatype "${datatype}"); allowed: ${[...allowed].join(', ')}`
    );
  }

  const hasValue = cond.value != null;
  const hasValues = cond.values != null && cond.values.length > 0;

  if (cond.operator === 'exists' || cond.operator === 'notExists') {
    if (hasValue || hasValues) badInput(`"${cond.operator}" does not take "value"/"values"`);
    return;
  }
  if (cond.operator === 'startsWith') {
    // cond.name is the prefix itself ("core:").
    if (hasValue || hasValues) badInput('"startsWith" does not take "value"/"values"');
    return;
  }
  if (cond.operator === 'in') {
    if (!hasValues || hasValue) badInput('"in" requires "values" (and not "value")');
  } else if (!hasValue || hasValues) {
    badInput(`"${cond.operator}" requires "value" (and not "values")`);
  }

  if (datatype === 'number' || datatype === 'date') {
    const literals = cond.operator === 'in' ? cond.values! : [cond.value!];
    for (const lit of literals) {
      if (!isValidLiteral(lit, datatype)) {
        badInput(
          `"${lit}" is not a valid ${datatype} literal for property "${cond.name}"${datatype === 'date' ? ' (expected YYYY-MM-DD)' : ''}`
        );
      }
    }
  }
}

const MAX_FILTER_DEPTH = 5; // generous for a UI filter-builder, e.g. (A or B) and (C or (D and E))
const MAX_FILTER_LEAVES = 25; // bounds the number of correlated EXISTS subqueries per query

// Depth and leaf count are independent guards: depth misses a wide tree (one
// `or` of 5000 siblings), the leaf count a long single-child chain.
export function validateFilterShape(filter: NodeFilterInput): void {
  walk(filter, 1);

  function walk(node: NodeFilterInput, depth: number): number {
    if (depth > MAX_FILTER_DEPTH) badInput(`filter is nested too deeply (max depth ${MAX_FILTER_DEPTH})`);
    const set = [node.property, node.edge, node.intrinsic, node.tag, node.and, node.or].filter((b) => b != null);
    if (set.length !== 1) {
      badInput('exactly one of "property", "edge", "intrinsic", "tag", "and", or "or" must be set on each filter node');
    }
    if (node.property || node.edge || node.intrinsic || node.tag) return 1;
    const list = (node.and ?? node.or)!;
    if (list.length === 0) badInput('"and"/"or" must not be an empty list');
    let leaves = 0;
    for (const child of list) {
      leaves += walk(child, depth + 1);
      if (leaves > MAX_FILTER_LEAVES) badInput(`filter has too many conditions (max ${MAX_FILTER_LEAVES})`);
    }
    return leaves;
  }
}

// Edge properties included: they share the node properties' datatype lookup.
export function collectPropertyNames(filter: NodeFilterInput, out: Set<string> = new Set()): Set<string> {
  if (filter.property) out.add(filter.property.name);
  if (filter.edge?.property) out.add(filter.edge.property.name);
  for (const c of filter.and ?? []) collectPropertyNames(c, out);
  for (const c of filter.or ?? []) collectPropertyNames(c, out);
  return out;
}

export function collectEdgeTypes(filter: NodeFilterInput, out: Set<string> = new Set()): Set<string> {
  if (filter.edge) out.add(filter.edge.type);
  for (const c of filter.and ?? []) collectEdgeTypes(c, out);
  for (const c of filter.or ?? []) collectEdgeTypes(c, out);
  return out;
}

// Call after validateFilterShape(), with the datatypes of collectPropertyNames(filter).
export function validateFilterOperators(filter: NodeFilterInput, datatypes: Map<string, string>): void {
  if (filter.property) {
    validateLeafCondition(filter.property, datatypes.get(filter.property.name) ?? 'text');
    return;
  }
  if (filter.edge) {
    if (filter.edge.property) validateLeafCondition(filter.edge.property, datatypes.get(filter.edge.property.name) ?? 'text');
    return;
  }
  if (filter.intrinsic) {
    validateIntrinsicCondition(filter.intrinsic);
    return;
  }
  if (filter.tag) {
    validateTagCondition(filter.tag);
    return;
  }
  for (const c of filter.and ?? []) validateFilterOperators(c, datatypes);
  for (const c of filter.or ?? []) validateFilterOperators(c, datatypes);
}

// A queryBlock stores its filter in the GraphQL wire format (enum names, "EQ"),
// which the editor sends as variables unchanged. A server-side caller of
// getNodes() bypasses Pothos' enum decoding, so it converts with fromWireFilter().
export type WirePropertyOperator = 'EQ' | 'NEQ' | 'CONTAINS' | 'EXISTS' | 'NOT_EXISTS' | 'IN' | 'GT' | 'GTE' | 'LT' | 'LTE' | 'STARTS_WITH';

export interface WirePropertyCondition {
  name: string;
  operator: WirePropertyOperator;
  value?: string | null;
  values?: string[] | null;
}

export type WireEdgeDirection = 'OUTGOING' | 'INCOMING' | 'EITHER';

export interface WireEdgeCondition {
  type: string;
  direction: WireEdgeDirection;
  property?: WirePropertyCondition | null;
}

export type WireIntrinsicField = 'SLUG' | 'TITLE' | 'CREATED_AT' | 'UPDATED_AT' | 'TYPE' | 'NAMESPACE_ID' | 'CREATED_BY' | 'CLASS_ID' | 'EXTERNAL_URL' | 'LOCALE';
export type WireClassMatch = 'IS_A' | 'EXACT';

export interface WireIntrinsicCondition {
  field: WireIntrinsicField;
  operator: WirePropertyOperator;
  value?: string | null;
  values?: string[] | null;
  // Absent means IS_A, so only EXACT is stored.
  classMatch?: WireClassMatch | null;
}

export type WireTagOperator = 'HAS' | 'HAS_ANY' | 'HAS_ALL' | 'HAS_NONE';

export interface WireTagCondition {
  operator: WireTagOperator;
  value?: string | null;
  values?: string[] | null;
}

export interface WireNodeFilter {
  property?: WirePropertyCondition | null;
  edge?: WireEdgeCondition | null;
  intrinsic?: WireIntrinsicCondition | null;
  tag?: WireTagCondition | null;
  and?: WireNodeFilter[] | null;
  or?: WireNodeFilter[] | null;
}

const TAG_OPERATOR_FROM_WIRE: Record<WireTagOperator, TagOperator> = {
  HAS: 'has',
  HAS_ANY: 'hasAny',
  HAS_ALL: 'hasAll',
  HAS_NONE: 'hasNone',
};

export const WIRE_TAG_OPERATORS: readonly WireTagOperator[] = ['HAS', 'HAS_ANY', 'HAS_ALL', 'HAS_NONE'];

export const INTRINSIC_FIELD_FROM_WIRE: Record<WireIntrinsicField, IntrinsicField> = {
  SLUG: 'slug',
  TITLE: 'title',
  CREATED_AT: 'createdAt',
  UPDATED_AT: 'updatedAt',
  TYPE: 'type',
  NAMESPACE_ID: 'namespaceId',
  CREATED_BY: 'createdBy',
  CLASS_ID: 'classId',
  EXTERNAL_URL: 'externalUrl',
  LOCALE: 'locale',
};

const CLASS_MATCH_FROM_WIRE: Record<WireClassMatch, ClassMatch> = {
  IS_A: 'isA',
  EXACT: 'exact',
};

const EDGE_DIRECTION_FROM_WIRE: Record<WireEdgeDirection, EdgeDirection> = {
  OUTGOING: 'outgoing',
  INCOMING: 'incoming',
  EITHER: 'either',
};

const OPERATOR_FROM_WIRE: Record<WirePropertyOperator, PropertyOperator> = {
  EQ: 'eq',
  NEQ: 'neq',
  CONTAINS: 'contains',
  EXISTS: 'exists',
  NOT_EXISTS: 'notExists',
  IN: 'in',
  GT: 'gt',
  GTE: 'gte',
  LT: 'lt',
  LTE: 'lte',
  STARTS_WITH: 'startsWith'
};

// Shared with traversal.ts: a traversal step's edge condition has the same shape.
export function fromWireEdgeCondition(edge: WireEdgeCondition): EdgeConditionInput {
  return {
    type: edge.type,
    direction: EDGE_DIRECTION_FROM_WIRE[edge.direction],
    property: edge.property ? { ...edge.property, operator: OPERATOR_FROM_WIRE[edge.property.operator] } : null,
  };
}

export function fromWireFilter(node: WireNodeFilter): NodeFilterInput {
  if (node.property) {
    return { property: { ...node.property, operator: OPERATOR_FROM_WIRE[node.property.operator] } };
  }
  if (node.edge) {
    return { edge: fromWireEdgeCondition(node.edge) };
  }
  if (node.intrinsic) {
    return {
      intrinsic: {
        field: INTRINSIC_FIELD_FROM_WIRE[node.intrinsic.field],
        operator: OPERATOR_FROM_WIRE[node.intrinsic.operator],
        value: node.intrinsic.value,
        values: node.intrinsic.values,
        ...(node.intrinsic.classMatch ? { classMatch: CLASS_MATCH_FROM_WIRE[node.intrinsic.classMatch] } : {}),
      },
    };
  }
  if (node.tag) {
    return { tag: { ...node.tag, operator: TAG_OPERATOR_FROM_WIRE[node.tag.operator] } };
  }
  if (node.and) return { and: node.and.map(fromWireFilter) };
  if (node.or) return { or: node.or.map(fromWireFilter) };
  return {};
}

const WIRE_FROM_OPERATOR: Record<PropertyOperator, WirePropertyOperator> = {
  eq: 'EQ',
  neq: 'NEQ',
  contains: 'CONTAINS',
  exists: 'EXISTS',
  notExists: 'NOT_EXISTS',
  in: 'IN',
  gt: 'GT',
  gte: 'GTE',
  lt: 'LT',
  lte: 'LTE',
  startsWith: 'STARTS_WITH'
};

// The query builder's operators per datatype, derived so they can't drift.
export const WIRE_OPERATORS_BY_DATATYPE: Record<string, readonly WirePropertyOperator[]> = Object.fromEntries(
  Object.entries(OPERATORS_BY_DATATYPE).map(([datatype, ops]) => [datatype, [...ops].map((op) => WIRE_FROM_OPERATOR[op])])
);

export const WIRE_INTRINSIC_OPERATORS_BY_CATEGORY: Record<IntrinsicFieldCategory, readonly WirePropertyOperator[]> = Object.fromEntries(
  Object.entries(INTRINSIC_OPERATORS_BY_CATEGORY).map(([category, ops]) => [category, [...ops].map((op) => WIRE_FROM_OPERATOR[op])])
) as unknown as Record<IntrinsicFieldCategory, readonly WirePropertyOperator[]>;

// The same wire split: a direct getNodes() caller converts with fromWireOrderBy().
export type OrderByKind = 'property' | 'intrinsic';
export type OrderDirection = 'asc' | 'desc';
export interface OrderByInput {
  // Absent means 'property': a stored orderBy without a kind sorts by a property.
  kind?: OrderByKind;
  // A property name, or an IntrinsicField for kind 'intrinsic'.
  name: string;
  direction: OrderDirection;
}

export type WireOrderByKind = 'PROPERTY' | 'INTRINSIC';
export type WireOrderDirection = 'ASC' | 'DESC';
export interface WireOrderByInput {
  kind?: WireOrderByKind;
  name: string;
  direction: WireOrderDirection;
}

export function fromWireOrderBy(o: WireOrderByInput | null | undefined): OrderByInput | null {
  if (!o) return null;
  // An unknown column is the caller's mistake, said as such, not as a database error.
  if (o.kind === 'INTRINSIC' && !isIntrinsicField(o.name)) badInput(`"${o.name}" is not an intrinsic field to sort by`);
  return { kind: o.kind === 'INTRINSIC' ? 'intrinsic' : 'property', name: o.name, direction: o.direction === 'ASC' ? 'asc' : 'desc' };
}
