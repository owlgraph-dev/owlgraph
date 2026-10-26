// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Route adapter, re-exported by src/routes/api/collections/[id]/members/[nodeId]/+server.ts.
import { json } from '@sveltejs/kit';
import { membersWithBasis, removeCuratedMember, setCuratedMemberLabel } from '$lib/features/collections/server';
import { isUuid } from '$lib/features/nodes';
import { arrangeableCollection } from './membership.server';
import type { RequestHandler } from '@sveltejs/kit';
import { apiError, apiErrorFrom } from '$lib/platform/apiErrors';

type Params = { id: string; nodeId: string };

// `label`: one text per language, or null to clear it.
export const PATCH: RequestHandler<Params> = async ({ params, request, locals }) => {
  const collection = await arrangeableCollection(locals, params.id);
  if (collection instanceof Response) return collection;
  if (!isUuid(params.nodeId)) return apiError('member_not_found');
  const body = await request.json().catch(() => ({}));
  if (!('label' in body)) return apiError('invalid_request', { field: 'label' });
  try {
    await setCuratedMemberLabel(collection.id, params.nodeId, body.label, locals.user);
    return json(await membersWithBasis(collection.id, locals.user));
  } catch (error) {
    return apiErrorFrom(error);
  }
};

export const DELETE: RequestHandler<Params> = async ({ params, locals }) => {
  const collection = await arrangeableCollection(locals, params.id);
  if (collection instanceof Response) return collection;
  if (!isUuid(params.nodeId)) return apiError('member_not_found');
  try {
    await removeCuratedMember(collection.id, params.nodeId, locals.user);
    return json(await membersWithBasis(collection.id, locals.user));
  } catch (error) {
    return apiErrorFrom(error);
  }
};
