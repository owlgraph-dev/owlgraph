// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Route adapter, re-exported by src/routes/api/pages/[id]/lock/heartbeat/+server.ts.
import { json } from '@sveltejs/kit';
import { heartbeatLock } from '$lib/features/pages/server';
import type { RequestHandler } from '@sveltejs/kit';
import { apiError } from '$lib/platform/apiErrors';

type Params = { id: string };

// Token-only: holding the token is holding the lock. 409 means taken over.
export const POST: RequestHandler<Params> = async ({ params, request }) => {
  const body = await request.json().catch(() => ({}));
  const token = typeof body?.token === 'string' ? body.token : '';
  if (!token) return apiError('invalid_request', { field: 'token' });
  const held = await heartbeatLock(params.id, token);
  if (!held) return apiError('lock_lost');
  return json({ ok: true });
};
