// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Listings read from Nextcloud, held in this process so a public page's readers
// share one request. Share keys hash the whole credential (never hold it), so a
// share connected anew or another server misses. When Nextcloud refuses a share,
// every listing of it is forgotten: what its owner withdrew is shown to nobody.
import { createHash } from 'node:crypto';
import type { PluginHost } from '$lib/plugins/api';
import { joinPath, relativeTo } from '../sharePath';
import { propfind, shareAccess, type DavProblem, type ShareSecret, type UserAccess } from './client.server';
import type { DavEntry } from './propfind.server';

export interface Listing {
  folder: DavEntry;
  entries: DavEntry[];
  /** When read or last confirmed unchanged, ms since the epoch. */
  checkedAt: number;
}

export type ListResult = { ok: true; listing: Listing } | { ok: false; problem: DavProblem; stale: Listing | null };

const MAX_LISTINGS = 500;
/** Across every listing of one kind; one listing holds up to 2000. */
const MAX_HELD_ENTRIES = 100_000;

/** Evicts the least recently kept first, bounded by count and by entries held. */
class HeldListings {
  private held = new Map<string, Listing>();
  private entries = 0;

  constructor(private readonly maxListings: number) {}

  get(key: string): Listing | undefined {
    return this.held.get(key);
  }

  set(key: string, listing: Listing): void {
    this.delete(key);
    this.held.set(key, listing);
    this.entries += listing.entries.length + 1;
    while (this.held.size > 1 && (this.held.size > this.maxListings || this.entries > MAX_HELD_ENTRIES)) this.delete(this.held.keys().next().value!);
  }

  delete(key: string): void {
    const listing = this.held.get(key);
    if (!listing) return;
    this.entries -= listing.entries.length + 1;
    this.held.delete(key);
  }

  deleteUnder(prefix: string): void {
    for (const key of [...this.held.keys()]) if (key.startsWith(prefix)) this.delete(key);
  }

  clear(): void {
    this.held.clear();
    this.entries = 0;
  }
}

const listings = new HeldListings(MAX_LISTINGS);
const inflight = new Map<string, Promise<ListResult>>();

function shareKey(origin: string, secret: ShareSecret): string {
  return `${origin}\n${createHash('sha256').update(`${secret.token}\n${secret.password ?? ''}`).digest('base64url').slice(0, 22)}`;
}

export function listingKey(origin: string, secret: ShareSecret, path: string): string {
  return `${shareKey(origin, secret)}\n${path}`;
}

// A refused share isn't asked again for a while: Nextcloud throttles this
// server's address per refused login, which would cost every share's readers.
// The wait is the cache time, doubling per refusal in a row, 15 minutes at most.
const MAX_WAIT_MS = 15 * 60_000;
const MAX_REFUSALS = 1000;
const refusals = new Map<string, { problem: 'revoked' | 'unauthorized'; at: number; strikes: number }>();

/** The share's last refusal while its wait lasts, else null. */
export function shareRefused(origin: string, secret: ShareSecret, waitMs: number, now: number = Date.now()): 'revoked' | 'unauthorized' | null {
  const refusal = refusals.get(shareKey(origin, secret));
  if (!refusal || waitMs <= 0) return null;
  const wait = Math.min(waitMs * 2 ** (refusal.strikes - 1), MAX_WAIT_MS);
  return now - refusal.at < wait ? refusal.problem : null;
}

/** A refusal is remembered and forgets the share's listings; a readable answer (null) ends the wait. */
export function noteShareAnswer(origin: string, secret: ShareSecret, problem: DavProblem | null, now: number = Date.now()): void {
  const key = shareKey(origin, secret);
  if (problem === 'revoked' || problem === 'unauthorized') {
    const before = refusals.get(key);
    refusals.delete(key);
    refusals.set(key, { problem, at: now, strikes: Math.min((before?.strikes ?? 0) + 1, 16) });
    if (refusals.size > MAX_REFUSALS) refusals.delete(refusals.keys().next().value!);
    listings.deleteUnder(`${key}\n`);
  } else if (problem === null) {
    refusals.delete(key);
  }
}

function remember(key: string, listing: Listing): void {
  listings.set(key, listing);
}

/** The held listing however old, without asking the server: what a page renders before its island asks. */
export function peekListing(origin: string, secret: ShareSecret, path: string): Listing | null {
  return listings.get(listingKey(origin, secret, path)) ?? null;
}

/** The held listing while younger than `maxAgeMs`, else the server's, unless the share is in its refusal wait. */
export async function readListing(
  host: PluginHost,
  origin: string,
  secret: ShareSecret,
  path: string,
  maxAgeMs: number,
  now: () => number = Date.now,
  waitMs: number = maxAgeMs
): Promise<ListResult> {
  const key = listingKey(origin, secret, path);
  const held = listings.get(key) ?? null;
  if (held && now() - held.checkedAt < maxAgeMs) return { ok: true, listing: held };
  const refused = shareRefused(origin, secret, waitMs, now());
  if (refused) return { ok: false, problem: refused, stale: null };
  let pending = inflight.get(key);
  if (!pending) {
    pending = refresh(host, origin, secret, path, key, held, now).finally(() => inflight.delete(key));
    inflight.set(key, pending);
  }
  return pending;
}

async function refresh(host: PluginHost, origin: string, secret: ShareSecret, path: string, key: string, held: Listing | null, now: () => number): Promise<ListResult> {
  // A refusal forgets the share's listings; any other failure keeps this one, to be shown as stale.
  const failed = (problem: DavProblem): ListResult => {
    noteShareAnswer(origin, secret, problem, now());
    return { ok: false, problem, stale: problem === 'revoked' || problem === 'unauthorized' ? null : held };
  };
  if (held?.folder.etag) {
    const head = await propfind(host, shareAccess(secret), path, 0, 'listing:revalidate');
    if (!head.ok) return failed(head.problem);
    const folder = head.entries.find((e) => e.path === path);
    if (folder?.folder && folder.etag === held.folder.etag) {
      noteShareAnswer(origin, secret, null);
      const listing = { ...held, folder, checkedAt: now() };
      remember(key, listing);
      return { ok: true, listing };
    }
  }
  const full = await propfind(host, shareAccess(secret), path, 1, 'listing:read');
  if (!full.ok) return failed(full.problem);
  noteShareAnswer(origin, secret, null);
  const folder = full.entries.find((e) => e.path === path);
  if (!folder?.folder) return { ok: false, problem: 'notFound', stale: held };
  const listing = { folder, entries: full.entries.filter((e) => e.path !== path), checkedAt: now() };
  remember(key, listing);
  return { ok: true, listing };
}

// A person's own folders are keyed by their connection first: what one person
// sees is theirs alone, and changes as they work.

/** A person's own listing is kept at most this long, whatever the cache time. */
const OWN_MAX_AGE_MS = 30_000;
const MAX_OWN = 500;
const ownListings = new HeldListings(MAX_OWN);
const ownInflight = new Map<string, Promise<ListResult>>();

const ownKey = (connectionId: string, rootFileid: string, path: string) => `${connectionId}\n${rootFileid}\n${path}`;

function rememberOwn(key: string, listing: Listing): void {
  ownListings.set(key, listing);
}

/** A node's root in a person's own files: its file id and its path. */
export interface OwnRoot {
  fileid: string;
  base: string;
}

export function peekOwnListing(connectionId: string, rootFileid: string, path: string): Listing | null {
  return ownListings.get(ownKey(connectionId, rootFileid, path)) ?? null;
}

/**
 * A folder below a node's root in a person's own files; paths relative to the
 * root. The root's listing must still name the file the node means.
 */
export async function readOwnListing(
  host: PluginHost,
  access: UserAccess,
  root: OwnRoot,
  path: string,
  maxAgeMs: number,
  now: () => number = Date.now
): Promise<ListResult> {
  const key = ownKey(access.connection.id, root.fileid, path);
  const held = ownListings.get(key) ?? null;
  if (held && now() - held.checkedAt < Math.min(maxAgeMs, OWN_MAX_AGE_MS)) return { ok: true, listing: held };
  let pending = ownInflight.get(key);
  if (!pending) {
    pending = refreshOwn(host, access, root, path, key, held, now).finally(() => ownInflight.delete(key));
    ownInflight.set(key, pending);
  }
  return pending;
}

async function refreshOwn(host: PluginHost, access: UserAccess, root: OwnRoot, path: string, key: string, held: Listing | null, now: () => number): Promise<ListResult> {
  const full = await propfind(host, access, joinPath(root.base, path), 1, 'listing:own');
  if (!full.ok) return { ok: false, problem: full.problem, stale: held };
  const entries = full.entries.flatMap((e) => {
    const inRoot = relativeTo(e.path, root.base);
    return inRoot === null ? [] : [{ ...e, path: inRoot }];
  });
  const folder = entries.find((e) => e.path === path);
  if (!folder?.folder || (path === '' && folder.fileid !== root.fileid)) return { ok: false, problem: 'notFound', stale: held };
  const listing = { folder, entries: entries.filter((e) => e.path !== path), checkedAt: now() };
  rememberOwn(key, listing);
  return { ok: true, listing };
}

/** For tests: a share or connection made anew misses by its key anyway. */
export function clearListings(): void {
  listings.clear();
  ownListings.clear();
  refusals.clear();
}
