// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The GraphQL host: the query root and the filter grammar. Other features add
// fields through their `graphql.server.ts` adapters, registered in a fixed order
// below, which fixes the printed schema the MCP `schema` tool hands to agents.
import { getNodeProperties } from '$lib/features/semantic/server';
import { builder, NodeTypeEnum, type GraphQLContext } from './builder.server';
import { NodeProperty, registerSemanticQueryFields, LocaleType } from '$lib/features/semantic/graphql.server';
import { registerSearchQueryFields } from '$lib/features/search/graphql.server';
import { registerPageNodeFields } from '$lib/features/pages/graphql.server';
import { getNodes, type ContentNodeHit } from './nodes.server';
import { traverse } from './traverse.server';
import type { NodeFilterInput, PropertyOperator, OrderByInput, OrderByKind, OrderDirection, EdgeDirection, IntrinsicField, ClassMatch, TagOperator } from '../nodeFilter';
import type { TraversalQueryInput } from '../traversal';

export type { GraphQLContext };

const PropertyOperatorType = builder.enumType('PropertyOperator', {
  description: 'Comparison operator for a PropertyCondition. Valid operators depend on the property\'s registered datatype (see property_definitions). STARTS_WITH is a name-prefix match (e.g. name starts with "core:" selects a whole group) and is valid for every datatype.',
  values: {
    EQ: { value: 'eq' },
    NEQ: { value: 'neq' },
    CONTAINS: { value: 'contains' },
    EXISTS: { value: 'exists' },
    NOT_EXISTS: { value: 'notExists' },
    IN: { value: 'in' },
    GT: { value: 'gt' },
    GTE: { value: 'gte' },
    LT: { value: 'lt' },
    LTE: { value: 'lte' },
    STARTS_WITH: { value: 'startsWith' }
  } satisfies Record<string, { value: PropertyOperator }>
});

const PropertyConditionInputType = builder.inputType('PropertyCondition', {
  description: 'A single semantic-property condition, e.g. status = "done".',
  fields: (t) => ({
    name: t.string({ required: true, description: 'The property name (see property_definitions / listPropertyNames).' }),
    operator: t.field({ type: PropertyOperatorType, required: true }),
    value: t.string({ required: false, description: 'Comparison value. Required for all operators except EXISTS/NOT_EXISTS/IN.' }),
    values: t.stringList({ required: false, description: 'Comparison values for the IN operator.' })
  })
});

const EdgeDirectionType = builder.enumType('EdgeDirection', {
  description: 'Which side of a typed edge the filtered node must be on.',
  values: {
    OUTGOING: { value: 'outgoing' },
    INCOMING: { value: 'incoming' },
    EITHER: { value: 'either' }
  } satisfies Record<string, { value: EdgeDirection }>
});

// getNodes validates `type` against the live relationship type catalog.
const EdgeConditionInputType = builder.inputType('EdgeCondition', {
  description: 'A typed-edge condition: connected via a given relationship type, optionally narrowed by an edge property.',
  fields: (t) => ({
    type: t.string({ required: true, description: 'A relationship_types slug.' }),
    direction: t.field({ type: EdgeDirectionType, required: true }),
    property: t.field({ type: PropertyConditionInputType, required: false, description: "A condition on the edge's own property values (edge_properties)." })
  })
});

const IntrinsicFieldType = builder.enumType('IntrinsicField', {
  description:
    'A node-level intrinsic field (slug, title, timestamps, type, namespace, creator, class) — a column of the node itself, as opposed to a semantic property (optional, user-defined, in node_properties). CLASS_ID is the node\'s class (a node_classes id, see the `nodeClasses` query); every node has one, at least its node type (page/document/collection) — TYPE is that class\'s nearest node-type ancestor. A CLASS_ID condition is polymorphic by default (see IntrinsicCondition.classMatch). EXTERNAL_URL is a link document\'s external URL — null for a page and an uploaded document, so it alone takes EXISTS/NOT_EXISTS (no value) as well as EQ, NEQ, CONTAINS and STARTS_WITH. LOCALE is the language the node\'s content is in (a language code such as "de" or "en"; EQ, NEQ, IN) — not the language of the interface.',
  values: {
    SLUG: { value: 'slug' },
    TITLE: { value: 'title' },
    CREATED_AT: { value: 'createdAt' },
    UPDATED_AT: { value: 'updatedAt' },
    TYPE: { value: 'type' },
    NAMESPACE_ID: { value: 'namespaceId' },
    CREATED_BY: { value: 'createdBy' },
    CLASS_ID: { value: 'classId' },
    EXTERNAL_URL: { value: 'externalUrl' },
    LOCALE: { value: 'locale' }
  } satisfies Record<string, { value: IntrinsicField }>
});

const ClassMatchType = builder.enumType('ClassMatch', {
  description:
    'How a CLASS_ID condition reads its class id(s) against the class hierarchy. IS_A (the default): the class or any of its subclasses — "is a document" includes every document subclass, and a node type id selects every node of that type. EXACT: precisely that class, no subclasses.',
  values: { IS_A: { value: 'isA' }, EXACT: { value: 'exact' } } satisfies Record<string, { value: ClassMatch }>
});

const IntrinsicConditionInputType = builder.inputType('IntrinsicCondition', {
  description:
    'A single intrinsic node-field condition, e.g. type = PAGE or createdAt >= "2026-01-01". Allowed operators depend on the field\'s category (text/date/type/namespace/creator/class) — see IntrinsicField. CLASS_ID filters the EXPLICIT class assignment (never class-implied properties) with EQ ("is a"), NEQ ("is not a") and IN ("is any of"), all polymorphic by default — see classMatch.',
  fields: (t) => ({
    field: t.field({ type: IntrinsicFieldType, required: true }),
    operator: t.field({ type: PropertyOperatorType, required: true }),
    value: t.string({ required: false, description: 'Comparison value. Required for all operators except IN.' }),
    values: t.stringList({ required: false, description: 'Comparison values for the IN operator.' }),
    classMatch: t.field({
      type: ClassMatchType,
      required: false,
      description: 'CLASS_ID only. Omitted = IS_A (the class and its subclasses); EXACT compares the assigned class alone.'
    })
  })
});

const TagOperatorType = builder.enumType('TagOperator', {
  description:
    'Set predicate for a TagCondition over a node\'s tags (node_tags — many per node, uncontrolled vocabulary; see the `tags` query for the catalog). HAS: carries the given tag (`value`). HAS_ANY / HAS_ALL / HAS_NONE: carries at least one / every / none of the given tags (`values`). Matching is case-insensitive.',
  values: {
    HAS: { value: 'has' },
    HAS_ANY: { value: 'hasAny' },
    HAS_ALL: { value: 'hasAll' },
    HAS_NONE: { value: 'hasNone' }
  } satisfies Record<string, { value: TagOperator }>
});

const TagConditionInputType = builder.inputType('TagCondition', {
  description: 'A tag-membership condition, e.g. HAS "2024" or HAS_ANY ["draft", "review"]. Tags are matched case-insensitively.',
  fields: (t) => ({
    operator: t.field({ type: TagOperatorType, required: true }),
    value: t.string({ required: false, description: 'The tag for HAS.' }),
    values: t.stringList({ required: false, description: 'The tags for HAS_ANY / HAS_ALL / HAS_NONE.' })
  })
});

// inputRef is usable in its own field list before .implement() runs. GraphQL
// can't say "exactly one of", so validateFilterShape checks it.
const NodeFilterInputType = builder
  .inputRef<NodeFilterInput>('NodeFilter')
  .implement({
    description:
      'A knowledge-graph node filter. Exactly one of "property", "edge", "intrinsic", "tag", "and", or "or" must be set on every node.',
    fields: (t) => ({
      property: t.field({ type: PropertyConditionInputType, required: false }),
      edge: t.field({ type: EdgeConditionInputType, required: false }),
      intrinsic: t.field({ type: IntrinsicConditionInputType, required: false }),
      tag: t.field({ type: TagConditionInputType, required: false }),
      and: t.field({ type: [NodeFilterInputType], required: false }),
      or: t.field({ type: [NodeFilterInputType], required: false })
    })
  });

const TraversalStartInputType = builder.inputType('TraversalStart', {
  description: 'The traversal\'s start set. Exactly one of "nodeIds" or "filter" must be set.',
  fields: (t) => ({
    nodeIds: t.stringList({ required: false, description: 'Explicit start node id(s).' }),
    filter: t.field({ type: NodeFilterInputType, required: false, description: 'A NodeFilter producing the start set.' })
  })
});

const TraversalStepInputType = builder.inputType('TraversalStep', {
  description:
    'One ordered hop: follow "edge" (optionally "repeat" times, for a variable-depth walk over one edge type — the cumulative reachable set across every hop, not just the deepest layer), keeping only candidates matching "targetFilter" as this step\'s output.',
  fields: (t) => ({
    edge: t.field({ type: EdgeConditionInputType, required: true }),
    targetFilter: t.field({ type: NodeFilterInputType, required: false }),
    repeat: t.int({ required: true, description: 'How many times to follow "edge" (1-5).' })
  })
});

const TraversalQueryInputType = builder.inputType('TraversalQuery', {
  description: 'A start set + ordered typed-edge steps to walk outward from it.',
  fields: (t) => ({
    start: t.field({ type: TraversalStartInputType, required: true }),
    steps: t.field({ type: [TraversalStepInputType], required: true })
  })
});

const OrderDirectionType = builder.enumType('OrderDirection', {
  description: 'Sort direction for the `nodes` query\'s orderBy argument.',
  values: {
    ASC: { value: 'asc' },
    DESC: { value: 'desc' }
  } satisfies Record<string, { value: OrderDirection }>
});

const OrderByKindType = builder.enumType('OrderByKind', {
  description: 'Whether "name" refers to a semantic property or an intrinsic node field. Defaults to PROPERTY (the original, pre-intrinsic-fields behavior) when omitted.',
  values: {
    PROPERTY: { value: 'property' },
    INTRINSIC: { value: 'intrinsic' }
  } satisfies Record<string, { value: OrderByKind }>
});

const OrderByInputType = builder.inputType('OrderBy', {
  description: 'Sort `nodes` results by a property\'s value or an intrinsic field. Absent -> most-recently-updated first (default).',
  fields: (t) => ({
    kind: t.field({ type: OrderByKindType, required: false, defaultValue: 'property' }),
    name: t.string({ required: true, description: 'The property name (kind PROPERTY) or IntrinsicField (kind INTRINSIC) to sort by.' }),
    direction: t.field({ type: OrderDirectionType, required: true })
  })
});

const ContentNode = builder.objectRef<ContentNodeHit>('ContentNode').implement({
  description: 'A knowledge-graph node (a page or document) matching a NodeFilter or reached by a traversal. `id` is the node\'s id, which is also its page\'s or document\'s id — the one links, MCP and every other query use. `nodes` stays page-scoped (only pages currently have a properties write-path/UI); `traverse` is node-generic, since edges connect nodes of any type.',
  fields: (t) => ({
    id: t.exposeID('id'),
    type: t.expose('type', { type: NodeTypeEnum }),
    title: t.exposeString('title'),
    url: t.exposeString('url', { description: 'Relative URL at which the node can be viewed.' }),
    slug: t.exposeString('slug'),
    createdAt: t.exposeString('createdAt', { description: 'ISO timestamp.' }),
    updatedAt: t.exposeString('updatedAt', { description: 'ISO timestamp.' }),
    namespaceId: t.exposeID('namespaceId'),
    createdBy: t.exposeID('createdBy', { nullable: true }),
    classId: t.exposeID('classId', { description: "The node's class (see nodeClasses) — always set: every node carries a class, at least its node type." }),
    className: t.exposeString('className', {
      description: "The node's class display name, resolved for the request's interface language (the viewer's chosen language, else Accept-Language among the enabled languages, else the site default language) — a node with no domain class carries its node type's class, e.g. \"Page\". For every translation, read the class from nodeClasses by classId."
    }),
    externalUrl: t.exposeString('externalUrl', {
      nullable: true,
      description:
        "A link document's external URL (http/https, never fetched by the server) — distinct from `url`, the node's own page. Null for a page and for an uploaded document."
    }),
    locale: t.field({
      type: LocaleType,
      description: "The language the node's content is in — what full-text search indexes it with and the content's `lang`. Not the interface language.",
      resolve: (n) => n.locale as 'en' | 'de'
    }),
    properties: t.field({
      type: [NodeProperty],
      description: "This node's full property set (not just the properties referenced in the filter).",
      resolve: async (n) => (await getNodeProperties(n.id)).map((a) => ({ name: a.name, value: a.value }))
    })
  })
});

builder.queryType({
  fields: (t) => ({
    nodes: t.field({
      type: [ContentNode],
      description:
        'Knowledge-graph nodes (pages) matching a semantic-property filter, scoped to the requesting user\'s readability.',
      args: {
        filter: t.arg({ type: NodeFilterInputType, required: true }),
        first: t.arg.int({
          required: false,
          defaultValue: 20,
          description: 'Maximum number of results (capped server-side).'
        }),
        offset: t.arg.int({ required: false, defaultValue: 0, description: 'Result offset for paging.' }),
        orderBy: t.arg({ type: OrderByInputType, required: false })
      },
      resolve: (_root, args, ctx) =>
        getNodes(ctx.user, {
          filter: args.filter as NodeFilterInput,
          first: args.first,
          offset: args.offset,
          orderBy: args.orderBy as OrderByInput | null
        })
    }),
    traverse: t.field({
      type: [ContentNode],
      description:
        'Multi-hop graph traversal from a start set along ordered typed-edge steps, scoped to the requesting user\'s readability at every hop (a hidden intermediate node prunes that path silently). Node-generic: results may be pages or documents.',
      args: {
        query: t.arg({ type: TraversalQueryInputType, required: true }),
        first: t.arg.int({
          required: false,
          defaultValue: 20,
          description: 'Maximum number of results (capped server-side).'
        }),
        offset: t.arg.int({ required: false, defaultValue: 0, description: 'Result offset for paging.' })
      },
      resolve: (_root, args, ctx) =>
        traverse(ctx.user, {
          query: args.query as TraversalQueryInput,
          first: args.first,
          offset: args.offset
        })
    })
  })
});

// Feature contributions, in the order their fields appear on the query root.
registerSemanticQueryFields();
registerSearchQueryFields();
registerPageNodeFields(ContentNode);

export const schema = builder.toSchema();
