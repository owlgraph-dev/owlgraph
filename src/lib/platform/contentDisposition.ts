// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// For a user-supplied filename (RFC 6266, RFC 8187). `new Response` throws on a
// header character above U+00FF, so `filename` gets an ASCII fallback and
// `filename*` the real name in UTF-8.
export function contentDisposition(type: 'inline' | 'attachment', filename: string): string {
  const clean = filename.replace(/[\u0000-\u001f\u007f"\\]/g, '').trim() || 'download';
  const ascii = clean.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]/g, '_');
  if (ascii === clean) return `${type}; filename="${clean}"`;
  const encoded = encodeURIComponent(clean).replace(/['()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
