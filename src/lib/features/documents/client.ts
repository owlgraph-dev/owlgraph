// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Node metadata (rename, tags, visibility) goes through features/nodes/client.ts.
import type { DocumentBlockData } from '$lib/features/content';
import { readApiError } from '$lib/platform/readApiError';

// The server's sentence, or null for an answer without one: the caller words that.
async function messageOf(res: Response): Promise<string | null> {
  const error = await readApiError(res);
  return error.code === 'unknown' ? null : error.message;
}

// `download` asks for an attachment, which only an upload has.
export function documentContentPath(documentId: string, opts: { shareId?: string; download?: boolean } = {}): string {
  const base = opts.shareId ? `/share/${opts.shareId}/content` : `/api/documents/${documentId}/content`;
  return opts.download ? `${base}?download` : base;
}

/** A document as a document block shows it to the viewer; hidden when missing, unreadable or unreachable. */
export async function loadDocumentEmbed(documentId: string): Promise<DocumentBlockData> {
  try {
    const res = await fetch(`/api/documents/${encodeURIComponent(documentId)}`, { headers: { accept: 'application/json' } });
    if (!res.ok) return { state: 'hidden' };
    return ((await res.json()) as { embed: DocumentBlockData }).embed;
  } catch {
    return { state: 'hidden' };
  }
}

export type ReplaceFileResult = { ok: true; filename: string; mime: string; size: number } | { ok: false; error: string };

// On a link document this switches it to an upload, removing its address.
export async function replaceDocumentFile(documentId: string, file: File): Promise<ReplaceFileResult> {
  const fd = new FormData();
  fd.set('file', file);
  const res = await fetch(documentContentPath(documentId), { method: 'PUT', body: fd });
  if (!res.ok) return { ok: false, error: (await readApiError(res)).message };
  const body = await res.json();
  return { ok: true, filename: body.filename, mime: body.mime, size: body.size };
}

export type UploadDocumentResult = { ok: true; id: string; slug: string } | { ok: false; error: string | null };

export async function uploadDocument(file: File, title: string, namespaceId: string | null): Promise<UploadDocumentResult> {
  const fd = new FormData();
  fd.set('file', file);
  fd.set('title', title);
  if (namespaceId) fd.set('namespaceId', namespaceId);
  const res = await fetch('/api/documents', { method: 'POST', body: fd });
  if (!res.ok) return { ok: false, error: await messageOf(res) };
  const body = await res.json();
  return { ok: true, id: body.id, slug: body.slug };
}

export async function createLinkDocument(url: string, title: string, namespaceId: string | null): Promise<UploadDocumentResult> {
  const fd = new FormData();
  fd.set('source', 'link');
  fd.set('externalUrl', url);
  fd.set('title', title);
  if (namespaceId) fd.set('namespaceId', namespaceId);
  const res = await fetch('/api/documents', { method: 'POST', body: fd });
  if (!res.ok) return { ok: false, error: await messageOf(res) };
  const body = await res.json();
  return { ok: true, id: body.id, slug: body.slug };
}

export type SetLinkResult = { ok: true; externalUrl: string } | { ok: false; error: string };

// On an upload this switches it to a link, deleting its stored file.
export async function setDocumentLink(documentId: string, url: string): Promise<SetLinkResult> {
  const res = await fetch(documentContentPath(documentId), {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ externalUrl: url }),
  });
  if (!res.ok) return { ok: false, error: (await readApiError(res)).message };
  const body = await res.json();
  return { ok: true, externalUrl: body.externalUrl };
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
