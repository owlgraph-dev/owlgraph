// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Route adapter, re-exported by src/routes/api/namespaces/slugs/+server.ts.
import { json } from '@sveltejs/kit';
import { listNamespaceSlugsForUser } from '$lib/features/namespaces/server';
import type { RequestHandler } from '@sveltejs/kit';


// hooks.client.ts awaits this before the router resolves (docs/architecture/routing.md).
// Reachable signed out, but viewer-scoped: it must not reveal a namespace the
// caller can't reach.
export const GET: RequestHandler = async ({ locals }) => {
  return json(await listNamespaceSlugsForUser(locals.user));
};
