// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// What the edit route adds to the node client: the loaded row kept in sync,
// URL changes, data reloads, and the lock around delete. The route's
// navigation is passed in.
import { nodePath, type NodeMetaClient } from '$lib/features/nodes';
import type { NodeMetaActions } from './nodeMeta';

export type NodeRow = { id: string; title: string; slug: string; namespace_id: string; namespace_slug: string | null };

export function nodeActions(
  client: NodeMetaClient,
  row: NodeRow,
  opts: {
    deleteFallback: string;
    beforeDelete?: () => void;
    /** The namespaces the route loaded, read when the node moves. */
    namespaces: () => readonly { id: string; slug: string | null; isDefault: boolean }[];
    goto: (href: string, opts?: { replaceState?: boolean; noScroll?: boolean; keepFocus?: boolean }) => Promise<void>;
    invalidateAll: () => Promise<void>;
  }
): NodeMetaActions {
  const { goto, invalidateAll } = opts;
  const editHref = () => nodePath(row.namespace_slug, row.slug, { edit: true });
  return {
    async onRename(changes) {
      const res = await client.rename(changes);
      if (!res.ok) return res;
      row.title = res.title;
      const slugChanged = changes.slug !== undefined && res.slug !== row.slug;
      row.slug = res.slug;
      // The URL is keyed by namespace and slug, so a refresh or a shared copy
      // must follow the rename.
      if (slugChanged) await goto(editHref(), { replaceState: true, noScroll: true, keepFocus: true });
      return res;
    },
    onSetTags: (tags) => client.setTags(tags),
    onSetManualProperties: (properties) => client.setManualProperties(properties),
    // The class decides which fields render, from the server's definitions,
    // so the data is reloaded; the editor reads `doc` only at mount.
    async onSetNodeClass(nodeClassId) {
      const res = await client.setNodeClass(nodeClassId);
      if (res.ok) await invalidateAll();
      return res;
    },
    // Reloaded so the canvas's lang follows.
    async onSetLocale(locale) {
      const res = await client.setLocale(locale);
      if (res.ok) await invalidateAll();
      return res;
    },
    async onDismissLocaleSuggestion() {
      const res = await client.dismissLocaleSuggestion();
      if (res.ok) await invalidateAll();
      return res;
    },
    // The document editor reads the visibility from the route data.
    async onSetVisibility(visibility) {
      const res = await client.setVisibility(visibility);
      if (res.ok) await invalidateAll();
      return res;
    },
    onSetShares: (shares) => client.setShares(shares),
    onCreateShareLink: (label) => client.createShareLink(label),
    onRevokeShareLink: (id) => client.revokeShareLink(id),
    // A new namespace is a new URL, as a renamed slug is.
    async onSetNamespace(namespaceId) {
      const res = await client.setNamespace(namespaceId);
      if (!res.ok) return res;
      const target = opts.namespaces().find((n) => n.id === namespaceId);
      row.namespace_id = namespaceId;
      row.namespace_slug = target?.isDefault ? null : (target?.slug ?? null);
      await goto(editHref(), { replaceState: true, noScroll: true, keepFocus: true });
      return res;
    },
    async onDelete() {
      const res = await client.remove(opts.deleteFallback);
      if (!res.ok) return res;
      opts.beforeDelete?.();
      await goto('/');
      return res;
    },
  };
}
