// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Route adapter for /api/styles/site/[hash], re-exported by src/routes/api/styles/site/[hash]/+server.ts.
import { getCompiledStyles } from '../customStyles.server';
import type { RequestHandler } from '@sveltejs/kit';
import { textError } from '$lib/platform/apiErrors';

type Params = { hash: string };

/**
 * Public: one artifact for everyone, with no viewer-scoped data. A route rather
 * than inline, so it fits `style-src 'self'` and caches across navigations. A
 * stale hash still gets the current bytes, without the long cache.
 */
export const GET: RequestHandler<Params> = async ({ params }) => {
  const compiled = await getCompiledStyles();
  if (!compiled) return textError('not_found');

  const fresh = params.hash === compiled.hash;
  return new Response(compiled.css, {
    headers: {
      'content-type': 'text/css; charset=utf-8',
      'x-content-type-options': 'nosniff',
      'cache-control': fresh ? 'public, max-age=31536000, immutable' : 'public, max-age=0, must-revalidate',
    },
  });
};
