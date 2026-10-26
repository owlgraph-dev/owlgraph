// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Browser client for the page API; node-level metadata is the node client's
// (nodes/client.ts). The shapes mirror the route adapters under ./routes/.
import type { LockHolder, LockStatus } from './types';
import type { BlockPick } from './pageDiff';
import { ACKNOWLEDGE_DROPPED_HEADER, UNKNOWN_DROPPED_CODE } from './unknownGuard';
import { readApiError } from '$lib/platform/readApiError';
import { rememberAssetSize, type ImageSize } from '$lib/features/content';

/** `unknownDropped`: refused by the unknown-block guard (unknownGuard.ts); resending changes nothing. */
export type SaveResult = { ok: true } | { ok: false; lockLost: boolean; unknownDropped?: boolean };

// 423: someone else holds the edit lock now.
export async function savePageDoc(pageId: string, doc: unknown, lockToken: string | null, acknowledgeDropped: readonly string[] = []): Promise<SaveResult> {
  let res: Response;
  try {
    res = await fetch(`/api/pages/${pageId}`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        ...(lockToken ? { 'x-edit-lock': lockToken } : {}),
        ...(acknowledgeDropped.length ? { [ACKNOWLEDGE_DROPPED_HEADER]: acknowledgeDropped.join(',') } : {}),
      },
      body: JSON.stringify(doc),
    });
  } catch {
    // Failed, not thrown, so the editor leaves its saving state and can retry.
    return { ok: false, lockLost: false };
  }
  if (res.ok) return { ok: true };
  const { code } = await readApiError(res);
  if (code === 'lock_lost') return { ok: false, lockLost: true };
  if (code === UNKNOWN_DROPPED_CODE) return { ok: false, lockLost: false, unknownDropped: true };
  // No console: the server logged the request (docs/architecture/logging.md, "Guardrail").
  return { ok: false, lockLost: false };
}

export type AcquireLockResult = { ok: true; token: string } | { ok: false; holder: LockHolder | null };

// `force` is the admin takeover. A network failure reads as blocked, holder unknown.
export async function acquirePageLock(pageId: string, force = false): Promise<AcquireLockResult> {
  const res = await fetch(`/api/pages/${pageId}/lock`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(force ? { force } : {}),
  }).catch(() => null);
  if (res && res.ok) {
    const body = await res.json().catch(() => ({}));
    if (body.ok) return { ok: true, token: body.token };
  }
  const error = await readApiError(res);
  return { ok: false, holder: error.code === 'lock_lost' ? ((error.status as LockHolder | undefined) ?? null) : null };
}

// Only a lost lock means taken over; a network blip is not a loss (the
// server's TTL is the backstop when offline).
export async function heartbeatPageLock(pageId: string, token: string): Promise<'ok' | 'lost' | 'unreachable'> {
  const res = await fetch(`/api/pages/${pageId}/lock/heartbeat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token }),
  }).catch(() => null);
  if (!res) return 'unreachable';
  if (res.ok) return 'ok';
  return (await readApiError(res)).code === 'lock_lost' ? 'lost' : 'ok';
}

// keepalive: the request outlives teardown and navigation.
export function releasePageLock(pageId: string, token: string): void {
  fetch(`/api/pages/${pageId}/lock`, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token }),
    keepalive: true,
  }).catch(() => {});
}

// For pagehide: sendBeacon is POST-only, hence its own endpoint. Token-scoped
// and idempotent, so a double release is harmless.
export function beaconReleasePageLock(pageId: string, token: string): void {
  if (typeof navigator === 'undefined' || !navigator.sendBeacon) return;
  const blob = new Blob([JSON.stringify({ token })], { type: 'application/json' });
  navigator.sendBeacon(`/api/pages/${pageId}/lock/release`, blob);
}

export async function getPageLockStatus(pageId: string): Promise<LockStatus | null> {
  const res = await fetch(`/api/pages/${pageId}/lock`).catch(() => null);
  if (!res || !res.ok) return null;
  return (await res.json().catch(() => null)) as LockStatus | null;
}

// Keeps an unsaved doc as a draft version; returns the current doc to reconcile against.
export async function saveDraftVersion(
  pageId: string,
  doc: unknown,
  baseVersionId: string | null
): Promise<{ versionId: string; currentDoc: unknown } | null> {
  const res = await fetch(`/api/pages/${pageId}/versions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ doc, baseVersionId }),
  });
  if (!res.ok) return null;
  return res.json();
}

export type ApplyPicksResult = { ok: true } | { ok: false; reason: 'lock' | 'unknown_dropped' | 'error' };

export async function applyPagePicks(pageId: string, picks: BlockPick[], lockToken: string): Promise<ApplyPicksResult> {
  const res = await fetch(`/api/pages/${pageId}/apply-picks`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ picks, lockToken }),
  }).catch(() => null);
  if (res && res.ok) return { ok: true };
  const { code } = await readApiError(res);
  if (code === UNKNOWN_DROPPED_CODE) return { ok: false, reason: 'unknown_dropped' };
  return { ok: false, reason: code === 'lock_lost' ? 'lock' : 'error' };
}

export async function uploadPageImage(pageId: string, file: File): Promise<{ id: string; size: ImageSize | null } | null> {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('pageId', pageId);
  const res = await fetch('/api/media', { method: 'POST', body: fd }).catch(() => null);
  if (!res?.ok) return null;
  const body = (await res.json()) as { id: string; size: ImageSize | null };
  // The size picks the image copies the editor offers (docs/architecture/media.md).
  if (body.size) rememberAssetSize(body.id, body.size);
  return body;
}

// Public-render HTML for the reconcile panel's previews, with the one stylesheet
// their `data-b` attributes point into.
export async function renderPageBlocks(pageId: string, blocks: unknown[]): Promise<{ html: string[]; css: string; canvasRuleId: string } | null> {
  const res = await fetch(`/api/pages/${pageId}/render-blocks`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ blocks }),
  });
  if (!res.ok) return null;
  const { html, css, canvasRuleId } = await res.json();
  return { html: html as string[], css: typeof css === 'string' ? css : '', canvasRuleId: typeof canvasRuleId === 'string' ? canvasRuleId : '' };
}

export type CreatePageResult =
  | { ok: true; id: string; slug: string; namespaceSlug: string | null }
  | { ok: false; error: string | null };

export async function createBlankPageViaApi(namespaceId: string | null, title?: string): Promise<CreatePageResult> {
  const res = await fetch('/api/pages', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ namespaceId, title }),
  });
  if (!res.ok) {
    const error = await readApiError(res);
    return { ok: false, error: error.code === 'unknown' ? null : error.message };
  }
  const body = await res.json();
  return { ok: true, id: body.id, slug: body.slug, namespaceSlug: body.namespaceSlug ?? null };
}
