// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Route adapter for /api/graphql, re-exported by src/routes/api/graphql/+server.ts.
import { createYoga } from 'graphql-yoga';
import { dev } from '$app/environment';
import { schema, type GraphQLContext } from '$lib/features/query/server';
import type { RequestEvent } from '@sveltejs/kit';


// Resolvers enforce visibility against `locals.user`, the GraphQL context.
// Introspection stays open, since tooling discovers the schema with it; the
// GraphiQL UI is off in production unless ENABLE_GRAPHIQL=true, less to probe.
const enableGraphiQL = dev || process.env.ENABLE_GRAPHIQL === 'true';
const yoga = createYoga<RequestEvent, GraphQLContext>({
  schema,
  graphqlEndpoint: '/api/graphql',
  // The platform Response, not yoga's ponyfill.
  fetchAPI: { Response },
  graphiql: enableGraphiQL,
  context: ({ locals }) => ({ user: locals.user })
});

const handle = (event: RequestEvent) => yoga.handleRequest(event.request, event);

export const GET = handle;
export const POST = handle;
