// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The one Pothos builder, which every feature's `graphql.server.ts` adapter
// extends. Adapters import it by direct path, never through the query barrel:
// the barrel re-exports the schema that imports them, a load-order cycle.
import SchemaBuilder from '@pothos/core';
import type { SessionUser } from '$lib/features/auth/server';
import { NODE_TYPES } from '$lib/features/nodes';

/** `user` comes from `locals.user`; every resolver scopes its data to it. */
export interface GraphQLContext {
  user: SessionUser | null;
}

export const builder = new SchemaBuilder<{ Context: GraphQLContext }>({});

// Shared by search results, class entries and content nodes, so it lives here.
export const NodeTypeEnum = builder.enumType('NodeType', {
  description: 'The node type: a page, a document, or a collection (an ordered set of nodes).',
  values: NODE_TYPES,
});
