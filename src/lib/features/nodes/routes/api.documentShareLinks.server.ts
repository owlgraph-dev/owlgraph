// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Route adapter, re-exported by src/routes/api/documents/[id]/share-links/+server.ts.
import { createShareLink, listShareLinks } from '#lib/features/nodes/server.ts';
import type { RequestHandler } from '@sveltejs/kit';
import { writableDocument } from './writable.server';

type Params = { id: string };

export const GET: RequestHandler<Params> = async ({ params, locals }) => {
  const doc = await writableDocument(locals, params.id);
  if (doc instanceof Response) return doc;
  return Response.json(await listShareLinks(params.id));
};

// Returns the raw token once; it can never be retrieved again.
export const POST: RequestHandler<Params> = async ({ params, request, locals }) => {
  const doc = await writableDocument(locals, params.id);
  if (doc instanceof Response) return doc;
  const body = await request.json().catch(() => ({}));
  const link = await createShareLink(params.id, locals.user?.id ?? null, String(body.label ?? ''), locals.log);
  return Response.json(link);
};
