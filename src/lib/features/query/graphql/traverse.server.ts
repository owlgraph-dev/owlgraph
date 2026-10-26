// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { GraphQLError } from 'graphql';
import type { SessionUser } from '$lib/features/auth/server';
import { getPropertyDatatypes } from '$lib/features/semantic/server';
import { getExistingRelationshipTypeSlugs } from '$lib/features/semantic/server';
import { traverseNodes, hydrateContentNodes } from '../traversal.server';
import {
  validateTraversalShape,
  collectTraversalPropertyNames,
  collectTraversalEdgeTypes,
  type TraversalQueryInput
} from '../traversal';
import { validateFilterOperators } from '../nodeFilter';
import { clampFirst, clampOffset } from '$lib/platform/pagination';
import type { ContentNodeHit } from './nodes.server';

export interface TraverseArgs {
  query: TraversalQueryInput;
  first?: number | null;
  offset?: number | null;
}

/** Multi-hop traversal, scoped to what `user` may read at every hop; the same steps as getNodes(). */
export async function traverse(user: SessionUser | null, args: TraverseArgs): Promise<ContentNodeHit[]> {
  validateTraversalShape(args.query);

  const names = [...collectTraversalPropertyNames(args.query)];
  const datatypes = await getPropertyDatatypes(names);
  if (args.query.start.filter) validateFilterOperators(args.query.start.filter, datatypes);
  for (const step of args.query.steps) {
    if (step.targetFilter) validateFilterOperators(step.targetFilter, datatypes);
    // Wrapped as an edge condition, so operator checks stay in nodeFilter.ts.
    if (step.edge.property) validateFilterOperators({ edge: step.edge }, datatypes);
  }

  const edgeTypes = [...collectTraversalEdgeTypes(args.query)];
  if (edgeTypes.length) {
    const valid = await getExistingRelationshipTypeSlugs(edgeTypes);
    const unknown = edgeTypes.find((t) => !valid.has(t));
    if (unknown) throw new GraphQLError(`unknown relationship type "${unknown}"`, { extensions: { code: 'BAD_USER_INPUT' } });
  }

  const first = clampFirst(args.first);
  const offset = clampOffset(args.offset);

  const ids = await traverseNodes(user, args.query, datatypes);
  const page = ids.slice(offset, offset + first);
  const nodes = await hydrateContentNodes(page);
  return nodes.map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    url: n.url,
    slug: n.slug,
    createdAt: n.createdAt,
    updatedAt: n.updatedAt,
    namespaceId: n.namespaceId,
    createdBy: n.createdBy,
    classId: n.classId,
    className: n.className,
    externalUrl: n.externalUrl,
    locale: n.locale
  }));
}
