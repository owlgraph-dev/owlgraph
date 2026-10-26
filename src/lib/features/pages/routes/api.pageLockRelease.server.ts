// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Route adapter, re-exported by src/routes/api/pages/[id]/lock/release/+server.ts.
import { json } from '@sveltejs/kit';
import { releaseLock } from '$lib/features/pages/server';
import type { RequestHandler } from '@sveltejs/kit';

type Params = { id: string };

// POST, so sendBeacon can fire it on tab close; otherwise the lock route's DELETE.
export const POST: RequestHandler<Params> = async ({ params, request }) => {
  const body = await request.json().catch(() => ({}));
  const token = typeof body?.token === 'string' ? body.token : '';
  if (token) await releaseLock(params.id, token);
  return json({ ok: true });
};
