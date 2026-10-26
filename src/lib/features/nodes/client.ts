// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Browser client for the node metadata API, which pages, documents and
// collections expose field for field.
import { apiErrorText, readApiError } from '$lib/platform/readApiError';

export type NodeApiKind = 'pages' | 'documents' | 'collections';

export interface NodeMetaProperty {
  name: string;
  value: string;
}

export type RenameResult = { ok: true; title: string; slug: string } | { ok: false; error: string };
export type SetTagsResult = { ok: true; tags: string[] } | { ok: false };
export type SetPropertiesResult = { ok: true; properties: NodeMetaProperty[] } | { ok: false };
export type SetVisibilityResult = { ok: true; visibility: string | null } | { ok: false };
export type SetSharesResult = { ok: true; shares: string[] } | { ok: false };
export type OkOrError = { ok: true } | { ok: false; error: string };
export type ShareLinkResult =
  | { ok: true; id: string; token: string; label: string; createdAt: string }
  | { ok: false; error: string };

async function patchJson(kind: NodeApiKind, id: string, body: Record<string, unknown>): Promise<Response> {
  return fetch(`/api/${kind}/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}


export function nodeMetaClient(kind: NodeApiKind, id: string) {
  return {
    async rename(changes: { title?: string; slug?: string }): Promise<RenameResult> {
      const res = await patchJson(kind, id, changes);
      if (!res.ok) return { ok: false, error: await apiErrorText(res) };
      const updated = await res.json();
      return { ok: true, title: updated.title, slug: updated.slug };
    },

    async setTags(tags: string[]): Promise<SetTagsResult> {
      const res = await patchJson(kind, id, { tags });
      if (!res.ok) return { ok: false };
      const body = await res.json();
      return { ok: true, tags: body.tags ?? [] };
    },

    async setManualProperties(properties: NodeMetaProperty[]): Promise<SetPropertiesResult> {
      const res = await patchJson(kind, id, { properties });
      if (!res.ok) return { ok: false };
      const body = await res.json();
      return { ok: true, properties: body.properties ?? [] };
    },

    // A string assigns a class, null resets to the node's own type.
    async setNodeClass(nodeClassId: string | null): Promise<OkOrError> {
      const res = await patchJson(kind, id, { nodeClassId });
      if (!res.ok) return { ok: false, error: await apiErrorText(res) };
      return { ok: true };
    },

    async setLocale(locale: string): Promise<OkOrError> {
      const res = await patchJson(kind, id, { locale });
      if (!res.ok) return { ok: false, error: await apiErrorText(res) };
      return { ok: true };
    },

    // Documents only: the author dismissed the detected-language suggestion.
    async dismissLocaleSuggestion(): Promise<{ ok: boolean }> {
      const res = await patchJson(kind, id, { dismissLocaleSuggestion: true });
      return { ok: res.ok };
    },

    // null inherits the namespace's access level; the answer is what was stored.
    async setVisibility(visibility: string | null): Promise<SetVisibilityResult> {
      const res = await patchJson(kind, id, { visibility });
      if (!res.ok) return { ok: false };
      const body = await res.json();
      return { ok: true, visibility: body.visibility };
    },

    // Pages only: 'light' | 'dark' | 'adaptive', or null for the site default.
    async setContentScheme(contentScheme: string | null): Promise<{ ok: boolean }> {
      const res = await patchJson(kind, id, { contentScheme });
      return { ok: res.ok };
    },

    async setShares(shares: string[]): Promise<SetSharesResult> {
      const res = await patchJson(kind, id, { shares });
      if (!res.ok) return { ok: false };
      const body = await res.json();
      return { ok: true, shares: body.shares ?? [] };
    },

    async setNamespace(namespaceId: string): Promise<OkOrError> {
      const res = await patchJson(kind, id, { namespaceId });
      if (!res.ok) return { ok: false, error: await apiErrorText(res) };
      return { ok: true };
    },

    async createShareLink(label: string): Promise<ShareLinkResult> {
      const res = await fetch(`/api/${kind}/${id}/share-links`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ label }),
      });
      if (!res.ok) return { ok: false, error: await apiErrorText(res) };
      const link = await res.json();
      return { ok: true, ...link };
    },

    async revokeShareLink(linkId: string): Promise<{ ok: boolean }> {
      const res = await fetch(`/api/${kind}/${id}/share-links/${linkId}`, { method: 'DELETE' });
      return { ok: res.ok };
    },

    // The node kinds word the fallback message differently.
    async remove(fallbackError: string): Promise<OkOrError> {
      const res = await fetch(`/api/${kind}/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const error = await readApiError(res);
        return { ok: false, error: error.code === 'unknown' ? fallbackError : error.message };
      }
      return { ok: true };
    },
  };
}

export type NodeMetaClient = ReturnType<typeof nodeMetaClient>;
