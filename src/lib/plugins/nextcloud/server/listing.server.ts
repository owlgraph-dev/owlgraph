// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// A collection's live listing, read as this viewer may read it (resolve.server.ts)
// and paged here, since WebDAV pages nothing. It never carries a share's token, a
// person's id or a WebDAV address. A reader may list any folder below the root:
// a block's start folder is presentation, not a boundary.
import type { PluginHost, PluginNode, PluginRequest } from '$lib/plugins/api';
import { checkSharePath } from '../sharePath';
import { decodeSecret, type DavProblem, type ShareSecret } from './client.server';
import { peekListing, peekOwnListing, readListing, readOwnListing, type Listing, type ListResult } from './cache.server';
import { heldLocation } from './locations.server';
import { collectionRef, documentRef, type SourceStatus } from './refs';
import { nodeAccess, placeholderReason, resolveNode, rootOfNode, viewerAccess, type Resolution } from './resolve.server';
import type { DavEntry } from './propfind.server';

export type SortKey = 'name' | 'modified' | 'size';
export type SortDir = 'asc' | 'desc';

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;
const DEFAULT_CACHE_SECONDS = 60;

export interface ListingEntry {
  path: string;
  name: string;
  folder: boolean;
  size: number | null;
  mime: string | null;
  modified: string | null;
  fileid: string | null;
  /** The collection's document for this file, when there is one the viewer may read. */
  linked: { id: string; href: string } | null;
}

export interface ListingView {
  /** `stale`: the last listing while the server fails; `loading`: none held yet (a page's first render). */
  state: 'ready' | 'stale' | 'loading' | 'unavailable';
  /** For the collection's writers only. */
  reason?: Exclude<SourceStatus, 'ok'>;
  /** Read with the viewer's own connection, or with the collection's share. */
  via: 'user' | 'node' | null;
  /** Nothing to read with: the viewer may connect their account, or connect it again, at `connectHref`. */
  access?: 'connect' | 'renew';
  connectHref?: string;
  /** `own`: a folder of someone's own files, so no document can be made of its files. */
  collection: { title: string; href: string; count: number | null; checkedAt: string | null; own: boolean };
  root: string;
  path: string;
  entries: ListingEntry[];
  /** Entries in the whole folder, not the page. */
  total: number;
  offset: number;
  checkedAt: string | null;
}

export interface ListingQuery {
  path: string;
  sort: SortKey;
  dir: SortDir;
  offset: number;
  limit: number;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** Folders first; ties on size or date by name A–Z, whatever the direction. */
export function sortEntries(entries: readonly DavEntry[], sort: SortKey, dir: SortDir): DavEntry[] {
  const sign = dir === 'desc' ? -1 : 1;
  const byKey = (a: DavEntry, b: DavEntry): number => {
    if (sort === 'size') return (a.size ?? -1) - (b.size ?? -1);
    if (sort === 'modified') return (a.modified ?? '').localeCompare(b.modified ?? '');
    return collator.compare(a.name, b.name);
  };
  return [...entries].sort((a, b) => {
    if (a.folder !== b.folder) return a.folder ? -1 : 1;
    return sign * byKey(a, b) || collator.compare(a.name, b.name);
  });
}

/** Numbers clamped; null for an invalid path. */
export function listingQuery(query: URLSearchParams): ListingQuery | null {
  const checked = checkSharePath(query.get('p') ?? '');
  if ('problem' in checked) return null;
  const sort = query.get('sort');
  const int = (name: string, fallback: number) => {
    const raw = query.get(name);
    const value = raw === null || raw.trim() === '' ? NaN : Number(raw);
    return Number.isInteger(value) && value >= 0 ? value : fallback;
  };
  return {
    path: checked.path,
    sort: sort === 'modified' || sort === 'size' ? sort : 'name',
    dir: query.get('dir') === 'desc' ? 'desc' : 'asc',
    offset: int('offset', 0),
    limit: Math.min(Math.max(int('limit', DEFAULT_PAGE_SIZE), 1), MAX_PAGE_SIZE),
  };
}

async function originOf(host: PluginHost): Promise<{ origin: string } | { problem: 'disabled' | 'unconfigured' }> {
  const upstream = await host.upstream();
  if (upstream) return { origin: upstream.origin };
  return { problem: (await host.settings()).enabled ? 'unconfigured' : 'disabled' };
}

export async function cacheSeconds(host: PluginHost): Promise<number> {
  const value = (await host.settings()).values.cacheSeconds;
  return typeof value === 'number' ? value : DEFAULT_CACHE_SECONDS;
}

const statusOf = (problem: DavProblem): Exclude<SourceStatus, 'ok'> => (problem === 'refused' ? 'unauthorized' : problem);

/**
 * A folder below a collection's root as the viewer may see it. With `network`
 * false nothing is awaited from the server (a page renders before its island
 * asks); `warm` starts a share fetch for next time. `returnTo`: where connecting
 * an account comes back to, by default the page being rendered.
 */
export async function listingOf(
  host: PluginHost,
  collection: PluginNode,
  q: ListingQuery,
  opts: { network: boolean; warm?: boolean; returnTo?: string | null }
): Promise<ListingView> {
  const ref = collectionRef(collection.ref);
  const known = { title: collection.title, href: collection.href, count: ref.count, checkedAt: ref.checkedAt, own: ref.hint !== null };
  const empty = (state: ListingView['state'], extra: Partial<ListingView> = {}): ListingView => ({
    state,
    via: null,
    collection: known,
    root: ref.name,
    path: q.path,
    entries: [],
    total: 0,
    offset: q.offset,
    checkedAt: null,
    ...extra,
  });
  const writer = () => host.nodes.canWrite(collection.id);
  const withReason = async (view: ListingView) => (view.reason && !(await writer()) ? { ...view, reason: undefined } : view);
  const placeholder = async (reason: 'connect' | 'renew' | 'unavailable', problem: Exclude<SourceStatus, 'ok'>): Promise<ListingView> =>
    reason === 'unavailable'
      ? withReason(empty('unavailable', { reason: problem }))
      : empty('unavailable', { access: reason, connectHref: host.connection.href(opts.returnTo ?? undefined) });
  const present = async (listing: Listing, via: 'user' | 'node', problem: Exclude<SourceStatus, 'ok'> | null): Promise<ListingView> => {
    const sorted = sortEntries(listing.entries, q.sort, q.dir);
    const page = sorted.slice(q.offset, q.offset + q.limit);
    const linked = await linkedFiles(host, collection.id, page);
    return withReason({
      state: problem ? 'stale' : 'ready',
      ...(problem ? { reason: problem } : {}),
      via,
      collection: known,
      root: q.path === '' ? listing.folder.name || ref.name : ref.name,
      path: q.path,
      entries: page.map((e) => ({
        path: e.path,
        name: e.name,
        folder: e.folder,
        size: e.size,
        mime: e.mime,
        modified: e.modified,
        fileid: e.fileid,
        linked: e.fileid ? (linked.get(e.fileid) ?? null) : null,
      })),
      total: sorted.length,
      offset: q.offset,
      checkedAt: new Date(listing.checkedAt).toISOString(),
    });
  };

  const origin = await originOf(host);
  if ('problem' in origin) return withReason(empty('unavailable', { reason: origin.problem }));

  if (!opts.network) {
    // A connected viewer's own listing comes from their island; meanwhile show
    // what is held of it, else the share's, else loading.
    const own = ref.fileid ? await viewerAccess(host) : null;
    if (own && ref.fileid && typeof heldLocation(own.connection.id, ref.fileid)?.path === 'string') {
      const held = peekOwnListing(own.connection.id, ref.fileid, q.path);
      if (held) return present(held, 'user', null);
    }
    const share = await nodeAccess(host, collection);
    if (!share) return own ? empty('loading') : placeholder(await placeholderReason(host, rootOfNode(collection)), 'unconfigured');
    const listing = peekListing(origin.origin, share.secret, q.path);
    const cacheMs = (await cacheSeconds(host)) * 1000;
    if (opts.warm && (!listing || Date.now() - listing.checkedAt >= cacheMs)) {
      void readListing(host, origin.origin, share.secret, q.path, 0, Date.now, cacheMs).catch(() => {});
    }
    return listing ? present(listing, 'node', null) : empty('loading');
  }

  const read = async (resolution: Resolution): Promise<ListResult | null> => {
    if (resolution.via === 'user') return readOwnListing(host, resolution.access, { fileid: resolution.fileid, base: resolution.base }, q.path, (await cacheSeconds(host)) * 1000);
    if (resolution.via === 'node') return readListing(host, origin.origin, resolution.access.secret, q.path, (await cacheSeconds(host)) * 1000);
    return null;
  };
  let resolution = await resolveNode(host, collection, { operation: 'listing' });
  let result = await read(resolution);
  if (resolution.via === 'user' && result && !result.ok && (result.problem === 'notFound' || result.problem === 'refused')) {
    // Moved since it was found, or the connection just refused: resolve once more.
    const again = await resolveNode(host, collection, { operation: 'listing', fresh: true });
    if (again.via !== 'user' || again.base !== resolution.base) {
      resolution = again;
      result = await read(again);
    }
  }
  if (resolution.via === null || !result) {
    const problem = resolution.via === null && resolution.problem ? statusOf(resolution.problem) : 'unconfigured';
    return placeholder(resolution.via === null ? resolution.reason : 'unavailable', problem);
  }
  const problem = result.ok ? null : statusOf(result.problem);
  if (resolution.via === 'node') await record(host, collection, q.path, result.ok ? result.listing : null, problem);
  const listing = result.ok ? result.listing : result.stale;
  if (!listing) return withReason(empty('unavailable', { via: resolution.via, reason: problem ?? 'unreachable' }));
  return present(listing, resolution.via, problem);
}

/** The collection's documents the viewer may read, by the file id they record. */
async function linkedFiles(host: PluginHost, collectionId: string, page: readonly DavEntry[]): Promise<Map<string, { id: string; href: string }>> {
  const out = new Map<string, { id: string; href: string }>();
  if (!page.some((e) => !e.folder && e.fileid)) return out;
  for (const member of await host.nodes.members(collectionId)) {
    const ref = documentRef(member.ref);
    if (ref && !out.has(ref.fileid)) out.set(ref.fileid, { id: member.id, href: member.href });
  }
  return out;
}

/**
 * Stores a share listing's status and, from the root, its count and file id;
 * only on a change, so readers of a healthy share write nothing. Own listings
 * are never stored: what one viewer finds says nothing to anyone else.
 */
async function record(host: PluginHost, collection: PluginNode, path: string, listing: Listing | null, problem: Exclude<SourceStatus, 'ok'> | null): Promise<void> {
  const ref = collectionRef(collection.ref);
  // A missing subfolder, or a server that failed once, says nothing of the share.
  const status: SourceStatus | null = problem === null ? 'ok' : problem === 'revoked' || problem === 'unauthorized' ? problem : null;
  if (status === null) return;
  const count = listing && path === '' ? listing.entries.length : ref.count;
  const fileid = (listing && path === '' ? listing.folder.fileid : null) ?? ref.fileid;
  if (status === ref.status && count === ref.count && fileid === ref.fileid) return;
  const changed = await host.nodes.observe(collection.id, { ...collection.ref, status, count, ...(fileid ? { fileid } : {}), checkedAt: new Date().toISOString() });
  if (changed && status !== ref.status) host.log.sourceState({ nodeId: collection.id, from: ref.status, to: status, ...(problem ? { reason: problem } : {}) });
}

/** GET listing?c=<collection>&p=<path>&sort=&dir=&offset=&limit=[&r=<the page it is shown on>] */
export async function listingRoute(request: PluginRequest, host: PluginHost): Promise<Response> {
  const collection = await host.nodes.read(request.query.get('c') ?? '');
  if (!collection || collection.type !== 'collection') return host.respond.error(404, 'not_found');
  const q = listingQuery(request.query);
  if (!q) return host.respond.error(400, 'invalid_request');
  return host.respond.json(await listingOf(host, collection, q, { network: true, returnTo: request.query.get('r') }));
}

/** The share credential of a node, or null when it holds none that opens. */
export async function secretOf(host: PluginHost, nodeId: string): Promise<ShareSecret | null> {
  return decodeSecret(await host.secrets.get(nodeId));
}
