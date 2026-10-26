// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Every tool runs through the app's own GraphQL path (readableNodes, the shape
// validators, clampFirst): no authz or cost logic of its own (docs/architecture/authorization.md).
import { z } from 'zod';
import { graphql as executeGraphql, parse, printSchema, Kind } from 'graphql';
import type { ToolRegistry } from '../../../mcp/registry';
import { text, errText } from '../../../mcp/registry';
import { traversalQueryShape } from './nodeFilterSchema.server';
import { can } from '$lib/features/auth/server';
import { traverse } from '$lib/features/query/server';
import { schema } from '$lib/features/query/server';
import { getPropertySuggestions, listRelationshipTypes, listNodeClasses, listTags } from '$lib/features/semantic/server';
import { localize, hasText } from '$lib/platform/i18n/localizedText';

export function registerQueryTools({ user, tool }: ToolRegistry): void {
  tool(
    'traverse',
    {
      title: 'Traverse graph',
      description:
        "Multi-hop graph traversal: walk typed edges outward from a start set, one ordered step at a time, and return the reachable node set (id/type/title/url), scoped to what you can read at every hop (a hidden intermediate silently prunes that path). `start` is exactly one of `nodeIds` (explicit ids) or `filter` (a NodeFilter producing the start set). Each `step` is `{edge:{type,direction,property?}, targetFilter?, repeat}` — `edge.type` is a relationship_types slug (see `schema` or get_relationships for slugs in use), `direction` is 'outgoing'|'incoming'|'either', and `repeat` (1-5) walks that edge that many hops, accumulating every candidate reached at any hop that also passes `targetFilter` (or all of them, if omitted) — not just the deepest layer. A NodeFilter node is exactly one of `property` (a leaf condition: name/operator/value(s)), `edge` (a typed-edge condition), `intrinsic` (a node-field condition: field slug|title|createdAt|updatedAt|type|namespaceId|createdBy|classId|externalUrl|locale — locale is the language a node's content is in, e.g. 'de'), `tag` (a tag-membership condition: operator has (`value`) | hasAny | hasAll | hasNone (`values`), case-insensitive — see list_tags for the vocabulary), `and`, or `or` (arrays of NodeFilter). Property operators: eq, neq, contains, exists, notExists, in (needs `values`), gt, gte, lt, lte, startsWith (a name-prefix match, e.g. name starts with 'core:'). To select nodes by semantic class ('all work packages'), use `intrinsic: {field:'classId', operator:'eq', value:<class id>}` — ids come from `schema`'s class catalog (every node carries exactly one class, at least its node type page/document/collection); operators eq ('is a'), neq ('is not a'), in ('is any of') over class ids, POLYMORPHIC by default (a class and all its subclasses — a node type's id selects every node of that type); add `classMatch:'exact'` to match the assigned class alone. There are no exists/notExists operators on classId. Hard bounds: max 5 steps, max repeat 5, max total depth 10, results capped like other tools. Call `schema` first for the exact relationship-type/property catalog if unsure.",
      inputSchema: {
        query: traversalQueryShape,
        first: z.number().int().positive().max(50).optional(),
        offset: z.number().int().nonnegative().optional(),
      },
    },
    'page:read',
    async ({ query, first, offset }) => text(JSON.stringify(await traverse(user, { query, first, offset }), null, 2))
  );

  tool(
    'graphql',
    {
      title: 'Run GraphQL query',
      description:
        "Run a read-only GraphQL query against this CMS's API (fields: nodes, traverse, search, propertyDefinitions, relationshipTypes, nodeClasses, tags — call `schema` for the full typed shape). Scoped to your permissions exactly like every other tool; only `query` operations are accepted (there are no mutations to run). A field-level authorization failure (e.g. querying propertyDefinitions without editor/admin) appears as an entry in the response's `errors` array with the data withheld, NOT as a tool-level error — check `errors`, not just whether the call succeeded. Prefer get_relationships/traverse/search for common cases; use this for anything they don't cover.",
      inputSchema: { query: z.string().max(4000), variables: z.record(z.string(), z.unknown()).optional() },
    },
    'page:read',
    async ({ query, variables }) => {
      const doc = parse(query);
      const badOp = doc.definitions.some((d) => d.kind === Kind.OPERATION_DEFINITION && d.operation !== 'query');
      if (badOp) return errText('Only query operations are allowed.');
      const result = await executeGraphql({ schema, source: query, variableValues: variables, contextValue: { user } });
      return text(JSON.stringify({ data: result.data, errors: result.errors?.map((e) => e.message) }, null, 2));
    }
  );

  tool(
    'schema',
    {
      title: 'GraphQL schema',
      description:
        "This CMS's GraphQL schema (SDL) for constructing `graphql`/`traverse` queries — every type/field/enum is documented inline (operators, traversal semantics, relationship-type shape). Also appends the live property, relationship-type and semantic-class catalogs when your role can read them (editor/admin) — use these for valid property names, relationship-type slugs and class ids (for a classId intrinsic condition) instead of guessing — and the tag catalog (for a tag condition; list_tags gives the same list). Catalog labels: `label`/`description`/`inverseLabel` are resolved for your request's interface language (your language preference, else Accept-Language among the enabled languages, else the site default language); `labels`/`descriptions`/`inverseLabels` hold every translation. Identifiers (name, slug, id) never change with the locale.",
      inputSchema: {},
    },
    'page:read',
    async () => {
      let out = printSchema(schema);
      out += can(user, 'property:read')
        ? `\n\n# Property catalog\n${JSON.stringify(
            (await getPropertySuggestions(user)).map((p) => ({ name: p.name, label: localize(p.label, p.name), labels: p.label, datatype: p.datatype })),
            null,
            2
          )}`
        : '\n\n# Property catalog: omitted (requires editor/admin role)';
      out += can(user, 'relationship:read')
        ? `\n\n# Relationship type catalog\n${JSON.stringify(
            (await listRelationshipTypes()).map((r) => ({
              slug: r.slug,
              label: localize(r.label, r.slug),
              labels: r.label,
              description: localize(r.description, ''),
              descriptions: r.description,
              inverseLabel: hasText(r.inverse_label) ? localize(r.inverse_label, '') : null,
              inverseLabels: r.inverse_label ?? {},
            })),
            null,
            2
          )}`
        : '\n\n# Relationship type catalog: omitted (requires editor/admin role)';
      // Global vocabulary, gated like the property catalogue: both are semantic schema.
      out += can(user, 'property:read')
        ? `\n\n# Class catalog (filter by class with intrinsic field "classId" = id; every node carries exactly one class, at least its node type)\n${JSON.stringify(
            (await listNodeClasses())
              .filter((c) => c.kind !== 'root')
              .map((c) => ({
                id: c.id,
                slug: c.slug,
                label: localize(c.label, c.slug),
                labels: c.label,
                description: localize(c.description, ''),
                descriptions: c.description,
                kind: c.kind,
                parentId: c.parent_id,
                nodeType: c.node_type,
                depth: c.depth,
              })),
            null,
            2
          )}`
        : '\n\n# Class catalog: omitted (requires editor/admin role)';
      // Content vocabulary, not schema: page:read, like list_tags.
      out += `\n\n# Tag catalog (filter by tag with a "tag" condition: has / hasAny / hasAll / hasNone, case-insensitive)\n${JSON.stringify(await listTags(user), null, 2)}`;
      return text(out);
    }
  );
}
