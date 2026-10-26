// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Route adapter for /api/media/branding/logo/[id], re-exported by src/routes/api/media/branding/logo/[id]/+server.ts.
import { getAssetMeta, getAssetBytes, servePublicAssetBytes } from '$lib/features/media/server';
import type { RequestHandler } from '@sveltejs/kit';
import { textError } from '$lib/platform/apiErrors';

type Params = { id: string };

// Public, unlike /api/media/[id]: the app bar shows the logo on anonymous pages.
// It must check kind 'logo' and scope 'global', or it would bypass
// /api/media/[id]'s visibility gate for any asset id. A replace deletes the old
// row, so an id's bytes never change and cache immutably.
export const GET: RequestHandler<Params> = async ({ params }) => {
  const meta = await getAssetMeta(params.id);
  if (!meta || meta.kind !== 'logo' || meta.scope !== 'global') return textError('not_found');

  const data = await getAssetBytes(params.id);
  if (!data) return textError('not_found');

  // An SVG logo gets the sandboxing CSP from servePublicAssetBytes.
  return servePublicAssetBytes(data);
};
