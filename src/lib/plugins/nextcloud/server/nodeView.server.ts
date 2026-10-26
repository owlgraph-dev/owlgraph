// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// A collection's own page (docs/architecture/plugins.md, "Node views"). It never waits on
// Nextcloud: the body starts from the listing held for this viewer, or
// `loading` with a fetch started. A page never carries the share's token.
import type { PluginHost, PluginNode, PluginNodeAction, PluginNodeViewData } from '$lib/plugins/api';
import { t } from '../messages';
import { PLUGIN_ROUTES } from '../blocks/routes';
import { decodeSecret } from './client.server';
import { DEFAULT_PAGE_SIZE, listingOf, type ListingView } from './listing.server';
import { collectionRef } from './refs';

/** What views/CollectionBody.svelte starts from. */
export interface CollectionBodyData {
  view: ListingView;
  /** What "40 s ago" counts from until the body runs in the browser. */
  renderedAt: number;
  base: string;
  /** The connected viewer's Nextcloud account name, shown to them alone. */
  readAs: string | null;
}

export async function collectionNodeView(node: PluginNode, _ctx: { canWrite: boolean }, host: PluginHost): Promise<PluginNodeViewData | null> {
  if (node.type !== 'collection' || !(await host.settings()).enabled) return null;
  const ref = collectionRef(node.ref);
  const view = await listingOf(host, node, { path: '', sort: 'name', dir: 'asc', offset: 0, limit: DEFAULT_PAGE_SIZE }, { network: false, warm: true });

  // Through its share, anyone who may read it; through their own files,
  // whoever connects, once the folder's id is known.
  const shared = decodeSecret(await host.secrets.get(node.id)) !== null;
  const own = ref.fileid !== null;
  const readsVia = shared && own ? t('node_reads_both') : shared ? t('node_reads_share') : own ? t('node_reads_own') : null;

  const connection = (await host.connection.status()) === 'active' ? await host.connection.open() : null;
  const upstream = await host.upstream();
  const actions: PluginNodeAction[] =
    connection && upstream && ref.fileid
      ? // index.php routes it whether or not the server has pretty addresses.
        [{ id: 'open', label: t('node_open'), href: `${upstream.origin}/index.php/f/${encodeURIComponent(ref.fileid)}`, external: true }]
      : [];

  const data: CollectionBodyData = { view, renderedAt: Date.now(), base: PLUGIN_ROUTES, readAs: connection?.accountLabel ?? null };
  return {
    data,
    readsVia,
    detail: view.state === 'ready' || view.state === 'stale' ? t('node_entries', { count: view.total }) : null,
    actions,
  };
}
