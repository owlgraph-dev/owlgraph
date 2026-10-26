// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Route adapter for /api/relationship-types, re-exported by src/routes/api/relationship-types/+server.ts.
import { json } from '@sveltejs/kit';
import { apiForbidden } from '$lib/features/auth/routes/requireAction.server';
import { listRelationshipTypes, getAllRelationshipTypeProperties } from '$lib/features/semantic/server';
import { localizeRelationshipType, byLabel } from '$lib/features/semantic';
import { can } from '$lib/features/auth/server';
import type { RequestHandler } from '@sveltejs/kit';

// Each type carries its mapped properties, so the editor's relationship modal
// needs no second round trip; labels resolved and sorted for the request's locale.
export const GET: RequestHandler = async ({ locals }) => {
  if (!can(locals.user, 'relationship:read')) return apiForbidden(locals.log, { action: 'relationship:read', resourceType: 'route' });

  const [types, propsByType] = await Promise.all([listRelationshipTypes(), getAllRelationshipTypeProperties()]);

  const results = types.map((t) => localizeRelationshipType(t, propsByType.get(t.slug) ?? [])).sort(byLabel);
  return json({ results });
};
