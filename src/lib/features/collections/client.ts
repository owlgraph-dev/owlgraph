// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Every answer about members carries them afresh with the basis of their
// order, which the next rearrangement names.
import type { LocalizedText } from '$lib/platform/i18n/localizedText';
import type { CollectionBlockData } from '$lib/features/content';
import type { CollectionMember } from './types';
import { readApiError } from '$lib/platform/readApiError';

/** A collection as a block shows it to the viewer; hidden when missing, unreadable or unreachable. */
export async function loadCollectionEmbed(collectionId: string): Promise<CollectionBlockData> {
  try {
    const res = await fetch(`/api/collections/${encodeURIComponent(collectionId)}`, { headers: { accept: 'application/json' } });
    if (!res.ok) return { state: 'hidden' };
    return ((await res.json()) as { embed: CollectionBlockData }).embed;
  } catch {
    return { state: 'hidden' };
  }
}

/** `code` is the server's ('cycle', 'stale_order', …) or 'network'; `error` the sentence for it. */
export type MembersResult =
  | { ok: true; members: CollectionMember[]; basis: string; existed: boolean }
  | { ok: false; code: string; error: string };

async function send(url: string, init: RequestInit): Promise<MembersResult> {
  try {
    const res = await fetch(url, { ...init, headers: { 'content-type': 'application/json', accept: 'application/json' } });
    if (!res.ok) {
      const error = await readApiError(res);
      return { ok: false, code: error.code, error: error.message };
    }
    const body = (await res.json()) as { members?: CollectionMember[]; basis?: string; existed?: boolean };
    if (!body.members || typeof body.basis !== 'string') return { ok: false, code: 'unknown', error: (await readApiError(null)).message };
    return { ok: true, members: body.members, basis: body.basis, existed: body.existed === true };
  } catch {
    const error = await readApiError(null);
    return { ok: false, code: error.code, error: error.message };
  }
}

const membersUrl = (collectionId: string, nodeId?: string) =>
  `/api/collections/${encodeURIComponent(collectionId)}/members${nodeId ? `/${encodeURIComponent(nodeId)}` : ''}`;

/** null places it in the default namespace; without a title it gets the default one. */
export async function createCuratedCollection(
  namespaceId: string | null,
  title?: string
): Promise<{ ok: true; id: string; slug: string; namespaceSlug: string | null } | { ok: false; error: string | null }> {
  const res = await fetch('/api/collections', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ namespaceId, ...(title?.trim() ? { title: title.trim() } : {}) }),
  });
  if (!res.ok) {
    const error = await readApiError(res);
    return { ok: false, error: error.code === 'unknown' ? null : error.message };
  }
  const body = await res.json();
  return { ok: true, id: body.id, slug: body.slug, namespaceSlug: body.namespaceSlug ?? null };
}

export const loadCollectionMembers = (collectionId: string): Promise<MembersResult> => send(membersUrl(collectionId), { method: 'GET' });

/** Adds at the end; an existing member stays where it is (`existed`). */
export const addCollectionMember = (collectionId: string, nodeId: string): Promise<MembersResult> =>
  send(membersUrl(collectionId), { method: 'POST', body: JSON.stringify({ nodeId }) });

/** `basis` is the order the editor read; a stale one is refused. */
export const reorderCollectionMembers = (collectionId: string, order: readonly string[], basis: string): Promise<MembersResult> =>
  send(membersUrl(collectionId), { method: 'PUT', body: JSON.stringify({ order, basis }) });

/** null clears the label. */
export const setCollectionMemberLabel = (collectionId: string, nodeId: string, label: LocalizedText | null): Promise<MembersResult> =>
  send(membersUrl(collectionId, nodeId), { method: 'PATCH', body: JSON.stringify({ label }) });

/** The node itself stays. */
export const removeCollectionMember = (collectionId: string, nodeId: string): Promise<MembersResult> => send(membersUrl(collectionId, nodeId), { method: 'DELETE' });
