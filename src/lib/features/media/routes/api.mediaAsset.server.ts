// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Route adapter, re-exported by src/routes/api/media/[id]/+server.ts.
import { getPage, userCanReadPage } from '#lib/features/pages/server.ts';
import { getAssetMeta, getAssetBytes, getImageVariant, servePublicAssetBytes, servesCopy, assetEtag } from '#lib/features/media/server.ts';
import { MEDIA_WIDTHS } from '#lib/features/media/index.ts';
import { logEvent } from '#lib/platform/logger.server.ts';
import type { RequestHandler } from '@sveltejs/kit';
import { isUuid } from '#lib/features/nodes/index.ts';
import { textError } from '#lib/platform/apiErrors.ts';

type Params = { id: string };

// Gated by the owning page's visibility; 404, not 403, so existence isn't
// revealed. `?w=` asks for a copy under the same gate (docs/architecture/media.md).
export const GET: RequestHandler<Params> = async ({ params, locals, url, request }) => {
  const w = url.searchParams.get('w');
  const width = w === null ? null : Number(w);
  if (width !== null && !MEDIA_WIDTHS.includes(width)) return textError('unsupported_width');

  const meta = isUuid(params.id) ? await getAssetMeta(params.id) : null;
  if (!meta) return textError('not_found');

  let isPublic = false;

  if (meta.scope === 'page') {
    const page = meta.owner_page_id ? await getPage(meta.owner_page_id) : null;
    if (!page || !(await userCanReadPage(locals.user, page))) return textError('not_found');
    // Effective, not raw: a page inheriting 'public' is as cacheable.
    isPublic = (page.visibility ?? page.space_access_level) === 'public';
  } else if (meta.scope === 'user') {
    // Avatars are served by /api/media/avatar/[userId] only, never here.
    return textError('not_found');
  } else {
    // Any other scope: signed-in users only.
    if (!locals.user) return textError('not_found');
  }

  // A gated image must never persist: a cached copy would survive logout or
  // reach the next user of a shared machine.
  const cacheControl = isPublic ? 'public, max-age=3600' : 'private, no-store';

  // An asset's bytes never change, so a matching ETag is answered without reading them.
  const etag = assetEtag(meta, width);
  if (request.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304, headers: { etag, 'cache-control': cacheControl } });
  }

  if (servesCopy(meta, width)) {
    try {
      const copy = await getImageVariant(meta.id, width!);
      if (copy) return servePublicAssetBytes(copy, { cacheControl, etag });
    } catch (e) {
      // A copy that can't be made is no reason not to show the image.
      logEvent(locals.log, 'media.variant_failed', { assetId: meta.id, width: width!, errorClass: e instanceof Error ? e.name : typeof e });
    }
  }

  const data = await getAssetBytes(params.id);
  if (!data) return textError('not_found');
  return servePublicAssetBytes(data, { cacheControl, etag: assetEtag(meta, null) });
};
