// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Route adapter, re-exported by src/routes/api/collections/[id]/members/+server.ts.
// Each answer carries the members and the basis of their order afresh.
import { json } from '@sveltejs/kit';
import { addCuratedMember, membersWithBasis, reorderCuratedMembers } from '$lib/features/collections/server';
import { isUuid } from '$lib/features/nodes';
import { arrangeableCollection } from './membership.server';
import type { RequestHandler } from '@sveltejs/kit';
import { apiError, apiErrorFrom } from '$lib/platform/apiErrors';

type Params = { id: string };

export const GET: RequestHandler<Params> = async ({ params, locals }) => {
  const collection = await arrangeableCollection(locals, params.id);
  if (collection instanceof Response) return collection;
  return json(await membersWithBasis(collection.id, locals.user));
};

// 201 when added; 200 with `existed` for a node that is a member already.
export const POST: RequestHandler<Params> = async ({ params, request, locals }) => {
  const collection = await arrangeableCollection(locals, params.id);
  if (collection instanceof Response) return collection;
  const body = await request.json().catch(() => ({}));
  if (!isUuid(body.nodeId)) return apiError('invalid_request', { field: 'nodeId' });
  try {
    const { added } = await addCuratedMember(collection.id, body.nodeId, locals.user);
    return json({ existed: !added, ...(await membersWithBasis(collection.id, locals.user)) }, { status: added ? 201 : 200 });
  } catch (error) {
    return apiErrorFrom(error);
  }
};

// `order` names each member the editor may read once; `basis` is the order they read.
export const PUT: RequestHandler<Params> = async ({ params, request, locals }) => {
  const collection = await arrangeableCollection(locals, params.id);
  if (collection instanceof Response) return collection;
  const body = await request.json().catch(() => ({}));
  const order: unknown = body.order;
  if (!Array.isArray(order) || !order.every((id) => typeof id === 'string') || typeof body.basis !== 'string') {
    return apiError('invalid_request', { field: 'order' });
  }
  try {
    await reorderCuratedMembers(collection.id, order as string[], body.basis, locals.user);
    return json(await membersWithBasis(collection.id, locals.user));
  } catch (error) {
    return apiErrorFrom(error);
  }
};
