// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Shared by /api/documents/[id]/content and /share/[id]/content, which differ
// only in how they authorize and cache. A plugin's document is answered by its integration.
import { servedFileHeaders } from '$lib/platform/servedFile';
import { safeExternalHref } from './externalUrl';

// An uploaded PDF is served inline without a sandbox, safe only because
// matchesDocumentType proved it a PDF at upload; text is sandboxed (platform/servedFile.ts).
export function documentBytesResponse(
  data: { mime: string; filename: string; bytes: Buffer },
  opts: { download: boolean; cacheControl: string }
): Response {
  // A Buffer can be a view into a pooled ArrayBuffer, whose offset a Response body
  // can mishandle and so disagree with content-length; a fresh copy can't.
  const body = new Uint8Array(data.bytes);
  const headers = servedFileHeaders({ mime: data.mime, filename: data.filename, download: opts.download, cacheControl: opts.cacheControl, length: body.byteLength });
  return new Response(body, { headers });
}

// Not an open redirect: the target is the stored document's, never the request's,
// and only a reader gets here. Re-checked so a row written past the API can't
// redirect to a script URL (null → 404). No cache, no referrer.
export function externalContentResponse(url: string | null): Response | null {
  const href = safeExternalHref(url);
  if (!href) return null;
  return new Response(null, {
    status: 302,
    headers: { location: href, 'cache-control': 'private, no-store', 'referrer-policy': 'no-referrer' },
  });
}
