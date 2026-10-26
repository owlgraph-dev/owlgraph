// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Route adapter for /api/media/fonts/[id], re-exported by src/routes/api/media/fonts/[id]/+server.ts.
import { getAssetMeta, getAssetBytes, servePublicAssetBytes } from '$lib/features/media/server';
import type { RequestHandler } from '@sveltejs/kit';
import { textError } from '$lib/platform/apiErrors';

type Params = { id: string };

// Public and unauthenticated: the font engine fetches @font-face URLs on
// anonymous pages too. SECURITY: the kind and scope check is what keeps this
// from bypassing /api/media/[id]'s page-visibility gate for any asset id.
// Always font/woff2, never the stored mime: uploads are checked by signature.
// A variant's row is never changed in place, so the bytes cache immutably.
export const GET: RequestHandler<Params> = async ({ params }) => {
  const meta = await getAssetMeta(params.id);
  if (!meta || meta.kind !== 'font' || meta.scope !== 'global') return textError('not_found');

  const data = await getAssetBytes(params.id);
  if (!data) return textError('not_found');

  return servePublicAssetBytes({ mime: 'font/woff2', bytes: data.bytes });
};
