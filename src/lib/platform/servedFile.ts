// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The headers every served file carries. The declared type is authoritative
// (nosniff); only the types below show inline, anything else (SVG included) is
// an octet-stream download, since a `<script src>` ignores the disposition.
// All but a PDF are sandboxed: browsers' PDF viewers render blank under one.
import { contentDisposition } from './contentDisposition';

// Apart from the upload allowlist: widening what can be stored must not widen
// what shows inline.
const INLINE_SAFE_MIME: ReadonlySet<string> = new Set([
  'application/pdf',
  'text/plain',
  'text/markdown',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
]);

const SANDBOX_CSP = "default-src 'none'; sandbox";
const MIME_TOKEN = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/;

/** A declared type's lowercase essence, or a plain byte stream for anything that is not one. */
export function servedMime(declared: string | null | undefined): string {
  const essence = (declared ?? '').split(';')[0].trim().toLowerCase();
  return MIME_TOKEN.test(essence) ? essence : 'application/octet-stream';
}

/** Inline when asked and safe, else a download. */
export function servedFileHeaders(input: {
  mime: string;
  filename: string;
  download: boolean;
  cacheControl: string;
  /** The body's exact length, when known up front. */
  length?: number | null;
}): Record<string, string> {
  const declared = servedMime(input.mime);
  const inline = !input.download && INLINE_SAFE_MIME.has(declared);
  const mime = inline ? declared : 'application/octet-stream';
  const isText = mime.startsWith('text/');
  const headers: Record<string, string> = {
    'content-type': isText ? `${mime}; charset=utf-8` : mime,
    'content-disposition': contentDisposition(inline ? 'inline' : 'attachment', input.filename),
    'x-content-type-options': 'nosniff',
    'cache-control': input.cacheControl,
  };
  if (input.length != null) headers['content-length'] = String(input.length);
  if (mime !== 'application/pdf') headers['content-security-policy'] = SANDBOX_CSP;
  return headers;
}
