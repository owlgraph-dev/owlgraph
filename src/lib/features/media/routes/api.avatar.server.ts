// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Route adapter, re-exported by src/routes/api/media/avatar/[userId]/+server.ts.
import { getUserAvatarMeta } from '$lib/features/media/server';
import { getAssetBytes, servePublicAssetBytes } from '$lib/features/media/server';
import type { RequestHandler } from '@sveltejs/kit';
import { textError } from '$lib/platform/apiErrors';

type Params = { userId: string };

// Public, unauthenticated. Keyed by user id so the URL survives a replace; the
// `?v=` the callers add (avatarUrl) only busts caches and is never read here.
export const GET: RequestHandler<Params> = async ({ params }) => {
  const meta = await getUserAvatarMeta(params.userId);
  if (!meta) return textError('not_found');

  const data = await getAssetBytes(meta.id);
  if (!data) return textError('not_found');

  return servePublicAssetBytes(data);
};
