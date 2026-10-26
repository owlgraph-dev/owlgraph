// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The editor's own Nextcloud, browsed through their connection to pick a folder
// or file. Never cached or stored: it is theirs, and only for the picking.
import type { PluginHost, PluginRequest } from '$lib/plugins/api';
import { propfind, turnedOff } from './client.server';
import { listingQuery, sortEntries } from './listing.server';
import { viewerAccess } from './resolve.server';
import type { SourceStatus } from './refs';

export interface OwnEntry {
  path: string;
  name: string;
  folder: boolean;
  size: number | null;
  mime: string | null;
  modified: string | null;
  fileid: string | null;
}

export interface OwnListingView {
  state: 'ready' | 'unavailable';
  /** No connection to read with: connect the account, or connect it again, at `connectHref`. */
  access?: 'connect' | 'renew';
  connectHref?: string;
  reason?: Exclude<SourceStatus, 'ok'>;
  /** '' for all their files. */
  path: string;
  folder: { name: string; fileid: string | null } | null;
  entries: OwnEntry[];
  total: number;
  offset: number;
}

/** GET own/listing?p=<path>&sort=&dir=&offset=&limit=[&r=<where they are>] */
export async function ownListingRoute(request: PluginRequest, host: PluginHost): Promise<Response> {
  const q = listingQuery(request.query);
  if (!q) return host.respond.error(400, 'invalid_request');
  const none = (extra: Partial<OwnListingView>): OwnListingView => ({ state: 'unavailable', path: q.path, folder: null, entries: [], total: 0, offset: q.offset, ...extra });
  if (await turnedOff(host)) return host.respond.json(none({ reason: 'disabled' }));
  const connectHref = host.connection.href(request.query.get('r') ?? undefined);
  const access = await viewerAccess(host);
  if (!access) return host.respond.json(none({ access: (await host.connection.status()) === 'none' ? 'connect' : 'renew', connectHref }));
  const looked = await propfind(host, access, q.path, 1, 'own:listing');
  if (!looked.ok) {
    return host.respond.json(none(looked.problem === 'refused' ? { access: 'renew', connectHref } : { reason: looked.problem }));
  }
  const folder = looked.entries.find((e) => e.path === q.path);
  if (!folder?.folder) return host.respond.json(none({ reason: 'notFound' }));
  const sorted = sortEntries(
    looked.entries.filter((e) => e.path !== q.path),
    q.sort,
    q.dir
  );
  const view: OwnListingView = {
    state: 'ready',
    path: q.path,
    folder: { name: folder.name, fileid: folder.fileid },
    entries: sorted.slice(q.offset, q.offset + q.limit).map((e) => ({ path: e.path, name: e.name, folder: e.folder, size: e.size, mime: e.mime, modified: e.modified, fileid: e.fileid })),
    total: sorted.length,
    offset: q.offset,
  };
  return host.respond.json(view);
}
