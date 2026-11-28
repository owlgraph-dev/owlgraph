// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Route adapter, re-exported by src/routes/api/spaces/slugs/+server.ts.
import { listSpaceSlugsForUser } from '#lib/features/spaces/server.ts';
import type { RequestHandler } from '@sveltejs/kit';


// hooks.client.ts awaits this before the router resolves (docs/architecture/routing.md).
// Reachable signed out, but viewer-scoped: it must not reveal a space the
// caller can't reach.
export const GET: RequestHandler = async ({ locals }) => {
  return Response.json(await listSpaceSlugsForUser(locals.user));
};
